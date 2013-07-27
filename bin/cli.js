#!/usr/bin/env node

var globals = require('../')

var report = globals.reportSync(process.cwd())

console.log(report.title)
var underline = ''
for (var i = 0; i < report.title.length; i++) {
  underline += '='
}
console.log(underline)
console.log()
console.log(report.message)