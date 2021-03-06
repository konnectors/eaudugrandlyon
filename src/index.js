process.env.SENTRY_DSN =
  process.env.SENTRY_DSN ||
  'https://b03459aba4074f3cb3e25d315001e29e@sentry.cozycloud.cc/130'

const {
  BaseKonnector,
  requestFactory,
  signin,
  scrape,
  saveBills,
  log,
  utils
} = require('cozy-konnector-libs')

const moment = require('moment')

const request = requestFactory({
  cheerio: true,
  debug: false,
  json: false,
  jar: true
})

const VENDOR = 'eaudugrandlyon'
const baseUrl = 'https://agence.eaudugrandlyon.com'

module.exports = new BaseKonnector(start)

async function start(fields) {
  log('info', 'Authenticating ...')

  await authenticate(fields.login, fields.password)
  log('info', 'Successfully logged in')

  log('info', 'Fetching the list of invoices')
  const $ = await request(`${baseUrl}/mon-espace-compte-consulter-facture.aspx`)

  log('info', 'Parsing list of invoices')
  const bills = await parseDocuments($)

  log('info', 'Saving data to Cozy')
  await saveBills(bills, fields, {
    identifiers: ['SOC EAU GD LYON']
  })
}

function authenticate(username, password) {
  return signin({
    url: `${baseUrl}/default.aspx`,
    formSelector: 'form',
    formData: {
      login: username,
      pass: password,
      connect: 'OK'
    },
    validate: (statusCode, $, fullResponse) => {
      if (fullResponse.body.includes('Identifiant ou mot de passe invalide')) {
        return false
      }

      return true
    }
  })
}

function parseDocuments($) {
  const docs = scrape(
    $,
    {
      title: {
        parse: normalizeDate
      },
      amount: {
        sel: 'td:nth-child(3)',
        parse: normalizePrice
      },
      fileurl: {
        sel: 'td:nth-child(5) > a',
        attr: 'href',
        parse: src => `${baseUrl}/${src}`
      }
    },
    'tr:not(:first-child)'
  )

  return docs
    .filter(d => {
      return !isNaN(d.amount)
    })
    .map(doc => ({
      ...doc,
      date: new Date(),
      currency: 'EUR',
      filename: formatFilename(doc),
      vendor: VENDOR,
      metadata: {
        importDate: new Date(),
        version: 1
      }
    }))
}

function normalizePrice(price) {
  return parseFloat(price.replace(',', '.').trim())
}

function normalizeDate(date) {
  return moment(date, 'DD/MM/YYYY')
}

function formatFilename(doc) {
  const date = moment(doc.title, 'DD/MM/YYYY')
  return `${utils.formatDate(date)}_${VENDOR}_${doc.amount.toFixed(2)}EUR${
    doc.vendorRef ? '_' + doc.vendorRef : ''
  }.pdf`
}
