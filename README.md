# TaxLookup
This is a basic website that I vibe-coded using Codex and Visual Studio Code.

## Problem I'm solving
- A business that provides location-based services in Washington State must collect sales tax at the rate relevant to that location.
- The tax rate varies based on city and county, and even some addresses within a city.  Therefore, "Seattle sales tax rate" may not get me the correct rate.
- Washington State department of revenue provides a website where you can enter an address and receive the correct sales tax rate
- I have to look up the address of a location using a tool such as Google Maps so that I can enter it into the DOR tool.

## The solution
This basic website takes a search term for a place, such as "Space Needle".  Clicking the search button sends the search request to the [Google Maps Places API](https://developers.google.com/maps/documentation/places/web-service/overview).  The back-end portion then takes the first result from that response, extracts the address, and sends it to [Washington DOR's public tax API](https://dor.wa.gov/wa-sales-tax-rate-lookup-url-interface).  It takes that returned tax rate and shows it to the user, along with the place name as returned in the Google search, and the returned address.  A tax name is listed, as well; it takes a tiered rate name from city, county, or state, depending on the most exact name returned.

Sure, this sort of product exists commercially, but it's quite expensive and I saw an easy way to automate it myself.

## How to use
This runs in Node, so you'll need that.  You'll also need to add your Google Maps Places API key into .env.  Run server.js in Node, open index.hmtl, and away you go!
