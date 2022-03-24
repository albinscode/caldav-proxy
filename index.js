
const express = require('express')
const app = express()
const fs = require('fs')
const fsPromises = require('fs').promises
const { createLogger, format, timestamp, prettyPrint, transports } = require('winston');
const logger = createLogger({
    format:format.combine(
        format.timestamp({format: 'MMM-DD-YYYY HH:mm:ss'}),
        format.splat(),
        format.align(),
        format.printf(info => `${info.level}: ${[info.timestamp]}: ${info.message}`),
    ),
    transports: [new transports.Console()]
});

const port = 3000
const caldav = require('caldav')
const config = require('./config.json')
// duration during which the last caldav request will be persisted into cache
const CACHE_DURATION = 3600
const CACHE_FILE = '.cached_calendar'
const EXAMPLE_FILE = 'two-events.ics'
const BEGIN_VEVENT = 'BEGIN:VEVENT'
const END_VCALENDAR = 'END:VCALENDAR'

app.get('/calendar.ics', (req, res) => {

    logger.info('Calling calendar')
    logger.info('If query in cache, date will be ignored until next data refresh')
    const dateStringFilter = req.query['date'] ? req.query['date'] : '20000101'
    const enableCache = req.query['cache'] ? true : false
    logger.info(`Using date ${dateStringFilter} and cache ${enableCache}`)
    getCalendar(res, dateStringFilter, enableCache)

})

// a simple ics that is working to test the service
// FIXME to put into a file
app.get('/single.ics', (req, res) => {

    logger.info('Calling single calendar')

    fsPromises.readFile(EXAMPLE_FILE, 'utf-8').then( (content, error) => {
        if (error) {
            res.send(error)
            logger.error(error)
        }
        else {
            res.send(content)
        }
    })

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
    logger.info('Writing cache file')
    fsPromises.writeFile(CACHE_FILE, content)
}

async function getCachedContent() {

    let content = ''
    try {
        const stats = await fsPromises.stat(CACHE_FILE)
        if ((Date.now() - stats.mtimeMs) / 1000 > CACHE_DURATION) {
            logger.info('Cache has expired')
        }
        else {
            logger.info('Reading file cache')
            content = await fsPromises.readFile(CACHE_FILE, 'utf-8')
        }
    }
    catch (e) {
        logger.info('Cache file does not exist')
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
        logger.info('We return the cache content instead of fresh data')
        res.send(cachedContent)
        return
    }

    // we don't have a cached calendar we retrieve it from caldav server
    const xhr = new caldav.transport.Basic(
        new caldav.Credentials(config.auth)
    );

    // caldav doc: https://sabre.io/dav/building-a-caldav-client/
    // thanks to the idea: https://support.google.com/calendar/thread/43801164/add-ical-address-and-pass-in-username-password?hl=en
    logger.info('fetching calendar')

    const account = await caldav.createAccount({
        server: config.url,
        xhr: xhr,
        loadObjects: true,
        loadCollections: true,
        // we start from 2022 to avoid too big calendar
        filters: createDateTimeFilter(dateStringFilter + 'T000000Z')
    })
    logger.info('calendar fetched')

    let firstEvent = true
    let content = ''
    account.calendars.forEach( (calendar) => {
        calendar.objects.forEach( o => {
            content = content + extractEvent(o.calendarData, firstEvent)
            firstEvent = false
        })
    })
    if (content !== '') content = content + END_VCALENDAR
    writeCachedContent(content)
    logger.info('calendar downloaded')
    res.send(content)
}

// we have to keep only events and wrap them in a single calendar
// because the full ics file is giving several calendars
function extractEvent(content, firstEvent) {
    // if not the first event we remove calendar headers
    if (!firstEvent) {
        let index = content.indexOf(BEGIN_VEVENT)
        if (index !== -1) content = content.substring(index)
    }
    let index = content.indexOf(END_VCALENDAR)
    // in all cases we remove last line of calendar end
    if (index !== -1) content = content.substring(0, index)

    // we put the default timezone if needed
    content = content.replace('DTSTART:', `DTSTART;TZID=${config.defaultTimeZone}:`)
    content = content.replace('DTEND:', `DTEND;TZID=${config.defaultTimeZone}:`)

    // on some external events like teams, we have timezone ending with "Z".
    // we have to remove it to take into account the TZID previously added
    // with associated timezome and saving daylight/standard
    content = content.replaceAll('00Z\n', '00\n')


    return content
}

app.listen(port, () => {
    logger.info(`Calendar app listening on port ${port}`)
})
