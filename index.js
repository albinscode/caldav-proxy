
const express = require('express')
const app = express()
const port = 3000
const caldav = require('caldav')
const config = require('./config.json')
const url = 'https://dav.linagora.com/calendars/5f61befa155943001e05f3f4/5f61befa155943001e05f3f4'

app.get('/calendar.ics', (req, res) => {

    console.log('Calling calendar')
    getCalendar(res)

})


async function getCalendar(res) {
  const xhr = new caldav.transport.Basic(
      new caldav.Credentials(config)
  );

  // caldav doc: https://sabre.io/dav/building-a-caldav-client/
  // thanks to the idea: https://support.google.com/calendar/thread/43801164/add-ical-address-and-pass-in-username-password?hl=en
  const account = await caldav.createAccount({
      server: url,
      xhr: xhr,
      loadObjects: true,
      loadCollections: true,
  })

  res.setHeader('content-type', 'text/calendar')

  account.calendars.forEach( (calendar) => {
      // can be buggy if there is more than one calendar!
      // we output the VCALENDAR stream
      calendar.objects.forEach( o => res.write(o.calendarData))
  })
  res.send()
}

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})


