var notGlobal = '10'
desc('not all global var refs are leaks', function () {
  msg = 'but this one is'
  var x = msg
})