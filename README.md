# Weather App

A simple weather app built with the [Visual Crossing Weather API](https://www.visualcrossing.com/weather-api), with no frameworks.

## Links

- **Project assignment:** [Weather App (roadmap.sh)](https://roadmap.sh/projects/weather-app)
- **Live demo:** https://weatherly00.vercel.app/

## Features

- Location input (city name or coordinates)
- Temperature, wind speed, chance of rain, and general conditions
- The previous 24 hours and the next 24 hours
- Refresh button
- Stretch goals: CSS animations while weather loads, and the default view is the users current location (the 📍 button repeats the lookup)

## How to run

1. Sign up for a free visual crossing account and copy your API key
2. Open 'config.js' and replace `YOUR_API_KEY_HERE` with your API key.
3. Serve the folder with a local server (geolocation only works on HTTPS or `localhost`), for example:
   - the **Live Server** extension in VS Code, or
   - `python3 -m http.server 8000`, then open http://localhost:8000
4. Allow location access in the browser, or type a location manually.

## File structure

| File         | Purpose                                         |
| ------------ | ----------------------------------------------- |
| `index.html` | Page structure                                  |
| `style.css`  | Layout, styling, and animations                 |
| `script.js`  | API requests, rendering, geolocation            |
| `config.js`  | API key (listed in `.gitignore`, do not commit) |

## Notes

- Values are shown in metric units (°C, km/h). For °F and mph, change `unitGroup: "metric"` to `"us"` in `script.js` and update the unit labels.
- The free Visual Crossing plan has a daily request limit, so avoid refreshing too often.
- If a key was ever committed to a public repo, create a new key in the Visual Crossing dashboard.
