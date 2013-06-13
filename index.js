var fs = require('fs')
var path = require('path')
var Transform = require('stream').Transform || require('readable-stream').Transform

var ls = require('lexical-scope')
var readdirp = require('readdirp')

exports.directory = directory
function directory(name, options) {
  name = path.resolve(name)
  return readdirp({root: name, fileFilter: '*.js'})
    .pipe(stream(options))
}

exports.stream = stream
function stream(options) {
  options = options || {}
  var s = new Transform({objectMode: true})
  s._transform = function (chunk, encoding, cb) {
    if (typeof chunk === 'object' && chunk.stat.isFile()) {
      chunk = chunk.fullPath
    }
    if (typeof chunk === 'string') {
      file(chunk, function (err, scope) {
        if (err) return cb(err)
        if (scope.explicit.length || (options.includeImplicit && scope.implicit.length)) s.push(scope)
        cb()
      })
    } else {
      cb()
    }
  }
  return s
}

exports.file = file
function file(name, cb) {
  fs.readFile(name, 'utf8', function (err, src) {
    if (err) return cb(err)
    var scope
    try {
      scope = ls(src)
      scope = {file: name, implicit: scope.globals.implicit.filter(notGlobal), explicit: scope.globals.exported.filter(notGlobal)}
    } catch (ex) {
      return cb(ex)
    }
    cb(null, scope)
  })
}

var globals = ['require', '__dirname', '__filename', 'module', 'exports']

function notGlobal(v) {
  return !(v in global) && globals.indexOf(v) === -1
}