
const express = require('express')
const app = express()
const fs = require('fs')
const port = 3000
const caldav = require('caldav')
const config = require('./config.json')
const url = 'https://dav.linagora.com/calendars/5f61befa155943001e05f3f4/5f61befa155943001e05f3f4'
// duration during which the last caldav request will be persisted into cache
const CACHE_DURATION = 3600
const CACHE_FILE = '.cached_calendar'

app.get('/calendar.ics', (req, res) => {

    console.log('Calling calendar')
    getCalendar(res)

})

// a simple ics that is working to test the service
// FIXME to put into a file
app.get('/single.ics', (req, res) => {

    console.log('Calling single calendar')
    
    res.write('BEGIN:VCALENDAR\n')
    res.write('VERSION:2.0\n')
    res.write('CALSCALE:GREGORIAN\n')
    res.write('BEGIN:VEVENT\n')
    res.write('SUMMARY:Access-A-Ride Pickup\n')
    res.write('DTSTART;TZID=America/New_York:20130802T103400\n')
    res.write('DTEND;TZID=America/New_York:20130802T110400\n')
    res.write('LOCATION:1000 Broadway Ave.\, Brooklyn\n')
    res.write('DESCRIPTION: Access-A-Ride trip to 900 Jay St.\, Brooklyn\n')
    res.write('STATUS:CONFIRMED\n')
    res.write('SEQUENCE:3\n')
    res.write('BEGIN:VALARM\n')
    res.write('TRIGGER:-PT10M\n')
    res.write('DESCRIPTION:Pickup Reminder\n')
    res.write('ACTION:DISPLAY\n')
    res.write('END:VALARM\n')
    res.write('END:VEVENT\n')
    res.write('BEGIN:VEVENT\n')
    res.write('SUMMARY:Access-A-Ride Pickup\n')
    res.write('DTSTART;TZID=America/New_York:20130802T200000\n')
    res.write('DTEND;TZID=America/New_York:20130802T203000\n')
    res.write('LOCATION:900 Jay St.\, Brooklyn\n')
    res.write('DESCRIPTION: Access-A-Ride trip to 1000 Broadway Ave.\, Brooklyn\n')
    res.write('STATUS:CONFIRMED\n')
    res.write('SEQUENCE:3\n')
    res.write('BEGIN:VALARM\n')
    res.write('TRIGGER:-PT10M\n')
    res.write('DESCRIPTION:Pickup Reminder\n')
    res.write('ACTION:DISPLAY\n')
    res.write('END:VALARM\n')
    res.write('END:VEVENT\n')
    res.write('END:VCALENDAR\n')
    res.send()
})

// datestring can be 19970714T000000Z
function createDateTimeFilter(dateString) {
    return [{
        type: 'comp-filter',
        attrs: { name: 'VCALENDAR' },
        children: [{
            type: 'comp-filter',
            attrs: { name: 'VEVENT' },
            children: [{
                type: 'time-range',
                attrs: { start: dateString }
            }]
        }]
    }]
}

async function getCachedContent() {
    
    return ''
}

async function getCalendar(res) {
  res.setHeader('content-type', 'text/calendar')

  // TODO we could use an  http param to activate cache with its duration
  const cachedContent = getCachedContent()

  // we have a cached calendar
  if (cachedContent) {
      res.send(cachedContent)
      return
  }

  // we don't have a cached calendar we retrieve it from caldav server
  const xhr = new caldav.transport.Basic(
      new caldav.Credentials(config)
  );

  // caldav doc: https://sabre.io/dav/building-a-caldav-client/
  // thanks to the idea: https://support.google.com/calendar/thread/43801164/add-ical-address-and-pass-in-username-password?hl=en
  console.log('fetching calendar')
  const account = await caldav.createAccount({
      server: url,
      xhr: xhr,
      loadObjects: true,
      loadCollections: true,
      // we start from 2022 to avoid too big calendar (it could be a http param)
      filters: createDateTimeFilter('20220101T000000Z')
  })
  console.log('calendar fetched')

  account.calendars.forEach( (calendar) => {
      // can be buggy if there is more than one calendar!
      // we output the VCALENDAR stream
      calendar.objects.forEach( o => res.write(o.calendarData))
  })
  res.send()
  console.log('calendar downloaded')
}

app.listen(port, () => {
    console.log(`Calendar app listening on port ${port}`)
})


