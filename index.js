
const express = require('express')
const app = express()
const fs = require('fs')
const fsPromises = require('fs').promises
const port = 3000
const caldav = require('caldav')
const config = require('./config.json')
const url = 'https://dav.linagora.com/calendars/5f61befa155943001e05f3f4/5f61befa155943001e05f3f4'
// duration during which the last caldav request will be persisted into cache
const CACHE_DURATION = 3600
const CACHE_FILE = '.cached_calendar'

app.get('/', (req, res) => {

    console.log('Calling calendar')
    console.log('If query in cache, date will be ignored until next data refresh')
    const dateStringFilter = req.query['date'] ? req.query['date'] : '20000101'
    const enableCache = req.query['cache'] ? true : false
    console.log(`Using date ${dateStringFilter} and cache ${enableCache}`)
    getCalendar(res, dateStringFilter, enableCache)

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


async function writeCachedContent(content) {
    console.log('Writing cache file')
    fsPromises.writeFile(CACHE_FILE, content)
}

async function getCachedContent() {

    let content = ''
    try {
        const stats = await fsPromises.stat(CACHE_FILE)
        if ((Date.now() - stats.mtimeMs) / 1000 > CACHE_DURATION) {
            console.log('Cache has expired')
        }
        else {
            console.log('Reading file cache')
            content = await fsPromises.readFile(CACHE_FILE, 'utf-8')
        }
    }
    catch (e) {
        console.log('Cache file does not exist')
        return content
    }
    return content
}

async function getCalendar(res, dateStringFilter, enableCache) {
  res.setHeader('content-type', 'text/calendar')

  // Cache on the vcalendar content is enabled
  let cachedContent = ''
  if (enableCache) cachedContent = await getCachedContent()

  // we have a cached calendar
  if (cachedContent !== '') {
      console.log('We return the cache content instead of fresh data')
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
      // we start from 2022 to avoid too big calendar
      filters: createDateTimeFilter(dateStringFilter + 'T000000Z')
  })
  console.log('calendar fetched')

  let content = ''
  account.calendars.forEach( (calendar) => {
      // can be buggy if there is more than one calendar!
      // we output the VCALENDAR stream
      calendar.objects.forEach( o => content = content + o.calendarData)
  })
  writeCachedContent(content)
  console.log('calendar downloaded')
  res.send(content)
}

app.listen(port, () => {
    console.log(`Calendar app listening on port ${port}`)
})


