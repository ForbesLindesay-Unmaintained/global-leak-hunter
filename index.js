var fs = require('fs')
var path = require('path')
var detect = require('lexical-scope')
var uglify = require('uglify-js')
var Promise = require('promise')

var sfs = {
  readFile: fs.readFileSync,
  readdir: fs.readdirSync,
  stat: fs.statSync
}
var pfs = {
  readFile: Promise.denodeify(fs.readFile),
  readdir: Promise.denodeify(fs.readdir),
  stat: Promise.denodeify(fs.stat)
}


var globals = ['require', '__dirname', '__filename', 'module', 'exports', 'Buffer', 'arguments', 'setImmediate']
//these are often available, but should never be assigned to
var domGlobals = ['window', 'document', 'describe', 'it', 'assert', 'define', 'bootstrap', 'ses']

module.exports = analyze
module.exports.file = analyzeFile
module.exports.fileSync = analyzeFileSync
module.exports.directory = analyzeDirectory
module.exports.directorySync = analyzeDirectorySync
module.exports.report = function (dir) { return analyzeDirectory(dir).then(report) }
module.exports.reportSync = function (dir) { return report(analyzeDirectorySync(dir)) }

function analyze(src) {
  var globals = detectGlobals(src)
  if (globals.names.length === 0) return {explicit: [], implicit: []}
  function isGlobal(name) {
    return globals.names.indexOf(name) != -1
  }
  var scoped = detect(src)
  return {
    source: src,
    nodes: globals.nodes,
    explicit: scoped.globals.exported.filter(isGlobal),
    implicit: scoped.globals.implicit.filter(isGlobal).filter(isRefError)
  }
}

function detectGlobals(src) {
  var ast = uglify.parse(src.toString())
  ast.figure_out_scope()
  var globals = ast.globals
    .map(function (node, name) {
      if (!isLeak(name)) return null
      return {name: name, node: node}
    })
    .filter(Boolean)
  var nodes = {}
  globals.forEach(function (n) {
    nodes[n.name] = n.node
  })
  return {
    nodes: nodes,
    names: globals.map(function (n) { return n.name })
  }
}

function isLeak(v) {
  return !(v in global) && globals.indexOf(v) === -1
}

function isRefError(v) {
  return isLeak(v) && domGlobals.indexOf(v) === -1
}

function analyzeFile(filename, callback) {
  return pfs.readFile(filename, 'utf8').then(analyze).nodeify(callback)
}
function analyzeFileSync(filename, callback) {
  return analyze(sfs.readFile(filename, 'utf8'))
}

function readdirp(basedir, callback) {
  return pfs.readdir(basedir)
    .then(function (files) {
      return files.map(function (name) {
        return pfs.stat(path.join(basedir, name))
          .then(function (stat) {
            return {
              stat: stat,
              path: path.join(basedir, name)
            }
          })
      })
    })
    .then(Promise.all)
    .then(function (files) {
      return files.map(function (file) {
        if (/node_modules$/.test(file.path) || /.git$/.test(file.path)) {
          return []
        }
        if (file.stat.isDirectory()) {
          return readdirp(file.path)
        } else {
          return [file.path]
        }
      })
    })
    .then(Promise.all)
    .then(function (files) {
      return files.reduce(function (a, b) { return a.concat(b) }, [])
    })
    .nodeify(callback)
}
function readdirpSync(basedir) {
  return sfs.readdir(basedir)
    .map(function (name) {
      return {
        stat: sfs.stat(path.join(basedir, name)),
        path: path.join(basedir, name)
      }
    })
    .map(function (file) {
      if (/node_modules$/.test(file.path) || /.git$/.test(file.path)) {
        return []
      }
      if (file.stat.isDirectory()) {
        return readdirpSync(file.path)
      } else {
        return [file.path]
      }
    })
    .reduce(function (a, b) { return a.concat(b) }, [])
}

function analyzeDirectory(basedir) {
  return readdirp(basedir)
    .then(function (files) {
      return files.filter(isJS).map(function (file) {
        return analyzeFile(file)
          .then(function (results) {
            results.path = path.relative(basedir, file).replace(/\\/g, '/')
            return results
          }, function (err) {
            return null
          })
      })
    })
    .then(Promise.all)
    .then(function (res) {
      return res.filter(Boolean)
    })
}
function analyzeDirectorySync(basedir) {
  return readdirpSync(basedir).filter(isJS).map(function (file) {
    try {
      var results = analyzeFileSync(file)
      results.path = path.relative(basedir, file).replace(/\\/g, '/')
      return results
    } catch (ex) {
      return null
    }
  })
  .filter(Boolean)
}
function isJS(filePath) {
  return /\.js$/.test(filePath)
}

function report(analysis) {
  var explicit = analysis.filter(function (result) {
    return result.explicit.length > 0
  })
  var implicit = analysis.filter(function (result) {
    return result.explicit.length === 0 && result.implicit.length > 0
  })
  var implicitMessage = 'ome of the JavaScript files in this repository seem to reference global variables that may not exist:\n\n' +
        implicit.map(function (a) { return ' - ' + a.path + ' (' + a.implicit.map(function (e) { return '`' + e + '`' }).join(', ') + ')' }).join('\n')
  var isTestOnly = explicit.every(function (result) {
    return /test/.test(result.path)
  })
  if (explicit.length === 0 && implicit.length === 0) {
    return {
      level: 'NONE',
      title: 'No Leaks',
      message: 'No global leaks detected'
    }
  } else if (explicit.length > 0) {
    return {
      level: 'EXPLICIT',
      isTestOnly: isTestOnly,
      title: 'Global Leaks',
      message: 'Some of the JavaScript files in this repository seem to have a global leaks, I have made a list of the files, and what globals they leak:\n\n' +
        explicit.map(function (a) { return ' - ' + a.path + ' (' + a.explicit.map(function (e) { return '`' + e + '`' }).join(', ') + ')' }).join('\n') +
        (implicit.length > 0 ? '\n\nIn adddition, s' + implicitMessage : '')
    }
  } else if (implicit.length > 0) {
    return {
      level: 'IMPLICIT',
      title: 'Possible Global Leaks',
      message: 'S' + implicitMessage
    }
  }
}