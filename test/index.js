'use strict'

var fs = require('fs')
var glh = require('../')

console.dir(glh(fs.readFileSync(__dirname + '/fixtures/leaks.js', 'utf8')))
console.log(glh.reportSync(__dirname + '/../').message)