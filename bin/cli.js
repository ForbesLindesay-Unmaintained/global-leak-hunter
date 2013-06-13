#!/usr/bin/env node

var path = require('path')
var Transform = require('stream').Transform || require('readable-stream').Transform

var optimist = require('optimist')
var color = require('bash-color')

var globals = require('../')

var args = require('optimist')
          .boolean('implicit')
          .alias('implicit', 'i')
          .boolean('json')
          .alias('json', 'j')
          .boolean('no-color')
          .argv

var p = path.resolve(args._[0] || '')

var strm = globals.directory(p, {includeImplicit: args.implicit})

if (args.json) {
  strm = strm.pipe(jsonify())
} else {
  strm = strm.pipe(format())
}

strm.pipe(process.stdout)

function jsonify() {
  var s = new Transform({objectMode: true})
  var first = true
  s._transform = function (chunk, encoding, callback) {
    if (first) {
      first = false
      s.push('[\n')
    } else {
      s.push(',\n')
    }
    s.push(JSON.stringify(chunk) + '\n')
    callback()
  }
  s._flush = function (callback) {
    if (first) {
      s.push('[\n')
    }
    s.push(']\n')
    callback()
  }
  return s
}
function format() {
  var explicit = 'explicit:'
  var implicit = 'implicit:'
  if (args.color != false) {
    explicit = color.red(explicit)
    implicit = color.green(implicit)
  }

  var s = new Transform({objectMode: true})
  s._transform = function (chunk, encoding, callback) {
    var file = chunk.file
    if (path.relative(process.cwd(), file).length < file.length) file = path.relative(process.cwd(), file)
    if (args.color != false) {
      file = color.cyan(file)
    }
    var explicits = chunk.explicit.map(function (e) { return '    - ' + e }).join('\n')
    var implicits = chunk.implicit.map(function (e) { return '    - ' + e }).join('\n')
    var e = explicits.length ? '\n  ' + explicit + '\n' + explicits : ''
    var i = implicits.length ? '\n  ' + implicit + '\n' + implicits : ''
    this.push(file + e + i + '\n')
    callback()
  }
  return s
}

function indent(str, indent) {
  return str.replace(/^/gm, indent)
}