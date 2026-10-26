const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const rootDirectory = __dirname;
const serverVersion = '2026-08-31';
loadEnvironmentFile(path.join(rootDirectory, '.env'));

const server = http.createServer(async (request, response) => {
  if (request.method === 'GET' && request.url === '/health') {
    return sendJson(response, 200, { status: 'ok', version: serverVersion });
  }

  if (request.method === 'GET' && request.url === '/') {
    return sendFile(response, path.join(rootDirectory, 'index.html'));
  }

  if (request.method === 'POST' && request.url === '/api/search') {
    return searchPlaces(request, response);
  }

  response.writeHead(404, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify({ error: 'Not found.' }));
});

async function searchPlaces(request, response) {
  const textQuery = await readTextQuery(request);
  if (!textQuery) return sendJson(response, 400, { error: 'A search term is required.' });

  if (!process.env.GOOGLE_MAPS_API_KEY) {
    return sendJson(response, 500, { error: 'GOOGLE_MAPS_API_KEY is not configured.' });
  }

  try {
    const placesResponse = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': process.env.GOOGLE_MAPS_API_KEY,
        'X-Goog-FieldMask': 'places.displayName,places.formattedAddress',
      },
      body: JSON.stringify({ textQuery }),
    });
    const data = await placesResponse.json();

    if (!placesResponse.ok) {
      return sendJson(response, placesResponse.status, data);
    }

    const places = (data.places || []).map((place) => ({
      ...place,
      formattedAddress: stripCountrySuffix(place.formattedAddress),
    }));
    const [place] = places;
    const address = parseAddress(place?.formattedAddress);
    if (!address) {
      return sendJson(response, 422, {
        error: 'The selected place did not include a U.S. street address and ZIP code.',
      });
    }

    const dorUrl = new URL('http://webgis.dor.wa.gov/webapi/AddressRates.aspx');
    dorUrl.searchParams.set('output', 'json');
    dorUrl.searchParams.set('addr', address.streetAddress);
    dorUrl.searchParams.set('zip', address.zip);

    const dorResponse = await fetch(dorUrl);
    const dorResponseText = await dorResponse.text();
    let dorData;
    try {
      dorData = JSON.parse(dorResponseText);
    } catch {
      dorData = { rawResponse: dorResponseText };
    }

    if (!dorResponse.ok) {
      return sendJson(response, dorResponse.status, {
        error: { message: 'Washington DOR request failed.', details: dorData },
      });
    }

    sendJson(response, 200, { places, address, tax: parseDorResponse(dorData) });
  } catch (error) {
    sendJson(response, 502, { error: { message: 'Could not complete the address lookup.', details: error.message } });
  }
}

function parseAddress(formattedAddress) {
  if (!formattedAddress) return null;

  const zipMatch = formattedAddress.match(/\b(\d{5})(?:-\d{4})?\b/);
  if (!zipMatch) return null;

  const addressBeforeZip = formattedAddress.slice(0, zipMatch.index).replace(/[\s,]+$/, '');
  const stateMatch = addressBeforeZip.match(/,\s*[A-Z]{2}$/);
  if (!stateMatch) return null;

  const streetAndCity = addressBeforeZip.slice(0, stateMatch.index);
  const lastComma = streetAndCity.lastIndexOf(',');
  const streetAddress = streetAndCity.slice(0, lastComma).trim();

  return streetAddress ? { streetAddress, zip: zipMatch[1] } : null;
}

function stripCountrySuffix(formattedAddress) {
  return formattedAddress?.replace(/,\s*USA\s*$/i, '');
}

function parseDorResponse(dorData) {
  const cityName = dorData['City Name']?.trim();
  const countyName = dorData['County Name']?.trim();

  return {
    locCode: dorData.LocCode,
    taxName: cityName || countyName || 'Unavailable',
    rate: dorData.Rate,
  };
}

function readTextQuery(request) {
  return new Promise((resolve) => {
    let body = '';
    request.on('data', (chunk) => (body += chunk));
    request.on('end', () => {
      try {
        resolve(JSON.parse(body).textQuery?.trim());
      } catch {
        resolve('');
      }
    });
  });
}

function loadEnvironmentFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}

function sendFile(response, filePath) {
  fs.readFile(filePath, (error, file) => {
    if (error) return sendJson(response, 500, { error: 'Could not load the page.' });

    response.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': file.length,
      'Cache-Control': 'no-store',
      'Connection': 'close',
      'X-Server-Version': serverVersion,
    });
    response.end(file);
  });
}

function sendJson(response, status, data) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(data));
}

server.listen(process.env.PORT || 3000, () => {
  console.log(`Open http://localhost:${process.env.PORT || 3000}`);
});
