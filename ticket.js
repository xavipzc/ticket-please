const fs = require('fs')
const cheerio = require('cheerio')
const moment = require('moment')
const args = process.argv.slice(2)
const file = args[0]

const REGX_DATE = /[0-9]{2}\/[0-9]{2}\/[0-9]{4}/g // Format: 31/12/1234
const REGX_PRICE = /[0-9]+,[0-9]{2} €/g // Format: 0,00 €
const REGX_AGE = /\((.*?)\)/g // Format: (0 à 3 ans)
const OUTPUT = 'ticket-result.json'

if (!file) {
	console.log('Usage: node ticket.js [file.html]')
} else {

	// Read html file
	fs.readFile(file, 'utf8', function(err, html){ 

			if (err) {
				writeJSON(JSON.stringify({status: "ko", error: err}, null, 2))
				return
			}

			// Using Cheerio to easily parse the html like in jQuery
			const $ = cheerio.load(html.replace(/\\r|\\n|\\/g, ''))

			const ref = $('.digital-box-cell').children('.block-pnr').find('.pnr-ref .pnr-info').text().trim()
			const name = $('.digital-box-cell').children('.block-pnr').find('.pnr-name .pnr-info').text().trim()
			const totalPrice = parsePrice($('table').find('.total-amount .very-important').text())
			const roundTripsObj = $('#block-command .product-details')

			if (!$ || !ref || !name || !totalPrice || !roundTripsObj) {
				writeJSON(JSON.stringify({status: "ko", error: 'missing informations'}, null, 2))
				return
			}

			// Fill our json result
			const result = {}
			const dateTripsObj = $('.pnr-summary')
			const passengersObj = $('#block-command .passengers')
			const prices = $('.product-header')

			let trips = {}

			const dateTrips = []
			if (dateTripsObj) {
				dateTripsObj.each(function(i, elem) {
						const parseDates = $(this).text().trim().match(REGX_DATE)
						const departure = parseDate(parseDates[0])
						const arrival = parseDate(parseDates[1])
						dateTrips.push(departure, arrival)
				})
			}

			const passengersByTrip = []
			if (passengersObj) {
				passengersObj.each(function(i, elem) {
					let item = [i]

					$(elem).find('.typology').each(function(i, e) {
						const passengerAge = $(e).text().trim().match(REGX_AGE)
						item[i] = {age: passengerAge[0]}
					})

					$(elem).find('.fare-details').each(function(i, e) {
						item[i] = { ...item[i], type: ($(e).text().trim().match('Billet échangeable')) ? 'échangeable' : 'non échangeable'}
					})

					passengersByTrip.push(item)
				})
			}

			// details
			trips.code = ref
			trips.name = name
			trips.details = {
				price: totalPrice,
				roundTrips: createRoundTrips($, roundTripsObj, dateTrips, passengersByTrip)
			}

			// custom
			if (prices) {
				const prices_list = []

				prices.each(function(i, elem) {
					const p = $(this).text().match(REGX_PRICE)
					prices_list.push({ value: parsePrice(p[0])})
				})

				result.custom = { prices: prices_list }
			}
			else {
				result.custom = {}
			}

			result.trips = [trips]

			writeJSON(JSON.stringify({status: "ok", result: result}, null, 2))
			console.log(`[${OUTPUT} is creating...]`)
	})
}


/////
// Retrieve Trip(s)

function createRoundTrips($, obj, dates, passengers) {
	const result = []

	obj.each(function(i, elem) {
			const dataTrips = {}

			// Travel Way
			dataTrips.type = $(this).find('.travel-way').text().trim()

			// Travel Date
			dataTrips.date = dates[i]

			const dataTrain = {}
			// Departure Informations
			const departureInfo = $(this).find('.segment-departure').text().trim().split('  ')
			dataTrain.departureTime = parseHour(departureInfo[0])
			dataTrain.departureStation = departureInfo[1]

			// Arrival Informations
			const arrivalInfo = $(this).find('.segment-arrival').text().trim().split('  ')
			dataTrain.arrivalTime = parseHour(arrivalInfo[0])
			dataTrain.arrivalStation = arrivalInfo[1]

			// Train Informations
			const trainInfo = $(this).find('.segment').text().trim().split('  ')
			dataTrain.type = trainInfo[0]
			dataTrain.number = trainInfo[1]

			// Passengers infos
			dataTrain.passengers = passengers[i]

			dataTrips.trains = [dataTrain]

			result.push(dataTrips)
	})

	return result
}

// helpers

function parsePrice(nb) {
	return Number(nb
				.replace(',', '.')
				.replace(' €', ''))
}

function parseHour(h) {
	return h.replace('h', ':')
}

function parseDate(date) {
	return moment(date, 'DD/MM/YYYY').format()
}

function writeJSON(data) {
	fs.writeFileSync(OUTPUT, data)
}
