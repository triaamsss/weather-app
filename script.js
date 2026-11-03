// =====================================================================
// Weather App - Visual Crossing Timeline API
// =====================================================================
//
// PROGRAM FLOW AT A GLANCE
//   1. init()           -> runs when the page opens, finds the starting location
//   2. loadWeather()    -> controls the process: loading -> fetch data -> display
//   3. fetchWeather()   -> sends the request to the Visual Crossing API
//   4. render()         -> shows the current weather + the hourly lists
//   5. Event listeners  -> search form, location button, refresh button
//
// Note: the API key is read from config.js (the CONFIG object).
// =====================================================================

// ---------------------------------------------------------------------
// CONSTANTS
// ---------------------------------------------------------------------

// Base address of the Visual Crossing Timeline API
const BASE_URL =
  "https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline";

// Fallback location if location permission is denied and there is no previous search
const DEFAULT_LOCATION = "Jakarta";

// Key for storing the last location in the browser's localStorage
const LAST_LOCATION_KEY = "weather:lastLocation";

// Placeholder text used in config.js (means the key has not been filled in yet)
const API_KEY_PLACEHOLDER = "YOUR_API_KEY_HERE";

// ---------------------------------------------------------------------
// DOM ELEMENTS
// ---------------------------------------------------------------------

// Shorthand for document.getElementById
const $ = (id) => document.getElementById(id);

// All HTML elements used, collected in one object to keep things tidy
const els = {
  form: $("search-form"), // location search form
  input: $("location-input"), // location input field
  geoBtn: $("geo-btn"), // 📍 button (my location)
  refreshBtn: $("refresh-btn"), // refresh button
  status: $("status"), // status text / error message
  current: $("current"), // current weather card
  place: $("place"), // location name
  updated: $("updated"), // update time
  icon: $("current-icon"), // big weather icon
  temp: $("current-temp"), // temperature
  cond: $("current-cond"), // conditions (clear, rain, etc.)
  wind: $("current-wind"), // wind speed
  rain: $("current-rain"), // chance of rain
  humidity: $("current-humidity"), // humidity
  nextSection: $("next-section"), // "Next 24 hours" section
  prevSection: $("prev-section"), // "Previous 24 hours" section
  nextList: $("next-list"), // container for the next 24 hours of cards
  prevList: $("prev-list"), // container for the previous 24 hours of cards
};

// ---------------------------------------------------------------------
// STATE (data that changes while the app runs)
// ---------------------------------------------------------------------

// The location currently shown, used by the refresh button.
// Shape: { type: "name" | "coords", value: "Jakarta" or "-6.2,106.8" }
let currentQuery = null;

// Request counter. If the user searches twice in quick succession,
// only the response from the latest request is allowed to be displayed.
let requestId = 0;

// ---------------------------------------------------------------------
// WEATHER ICONS & LABELS
// ---------------------------------------------------------------------

// Maps the "icon" name from the API to an emoji and a short label
const ICONS = {
  "clear-day": { emoji: "☀️", label: "Clear" },
  "clear-night": { emoji: "🌙", label: "Clear" },
  "partly-cloudy-day": { emoji: "⛅", label: "Partly cloudy" },
  "partly-cloudy-night": { emoji: "☁️", label: "Partly cloudy" },
  cloudy: { emoji: "☁️", label: "Cloudy" },
  fog: { emoji: "🌫️", label: "Fog" },
  wind: { emoji: "💨", label: "Windy" },
  rain: { emoji: "🌧️", label: "Rain" },
  "showers-day": { emoji: "🌦️", label: "Light rain" },
  "showers-night": { emoji: "🌧️", label: "Light rain" },
  "thunder-rain": { emoji: "⛈️", label: "Thunderstorm" },
  "thunder-showers-day": { emoji: "⛈️", label: "Thunderstorm" },
  "thunder-showers-night": { emoji: "⛈️", label: "Thunderstorm" },
  snow: { emoji: "❄️", label: "Snow" },
  "snow-showers-day": { emoji: "🌨️", label: "Light snow" },
  "snow-showers-night": { emoji: "🌨️", label: "Light snow" },
  hail: { emoji: "🌨️", label: "Hail" },
  "rain-snow": { emoji: "🌨️", label: "Rain and snow" },
  "rain-snow-showers-day": { emoji: "🌨️", label: "Rain and snow" },
  "rain-snow-showers-night": { emoji: "🌨️", label: "Rain and snow" },
};

/**
 * Gets the emoji and label for an icon name from the API.
 * @param {string} name - icon name from the API, e.g. "rain" or "clear-day"
 * @returns {{emoji: string, label: string}} - if the name is unknown,
 *          a thermometer icon with the label "Unknown" is returned
 */
function iconInfo(name) {
  return ICONS[name] || { emoji: "🌡️", label: "Unknown" };
}

// ---------------------------------------------------------------------
// HELPER FUNCTIONS (UTILITIES)
// ---------------------------------------------------------------------

/**
 * Rounds a number to the nearest whole number.
 * @param {number} n - number from the API (may be missing/null)
 * @returns {number|string} - the rounded number, or "-" if there is no data
 */
const round = (n) => (typeof n === "number" ? Math.round(n) : "-");

/**
 * Shows a message below the search form.
 * @param {string} message - the message text (empty string = clear the message)
 * @param {string} [type] - pass "error" for a red-tinted error message
 */
function setStatus(message, type = "") {
  els.status.textContent = message;
  els.status.className = "status" + (type ? " " + type : "");
}

/**
 * Checks whether the API key has been filled in config.js.
 * @returns {boolean} - true if CONFIG exists and the key is not the placeholder text
 */
function hasApiKey() {
  return (
    typeof CONFIG !== "undefined" &&
    CONFIG.API_KEY &&
    CONFIG.API_KEY !== API_KEY_PLACEHOLDER
  );
}

/**
 * Replays a CSS animation on an element.
 * A CSS animation only runs once when the class is added, so the class
 * is removed first, the browser is forced to recalculate the layout
 * (reflow), and then the class is added again.
 * @param {HTMLElement} el - the element being animated
 * @param {string} className - the class that triggers the animation
 */
function restartAnimation(el, className) {
  el.classList.remove(className);
  void el.offsetWidth; // forces a reflow
  el.classList.add(className);
}

// ---------------------------------------------------------------------
// FETCHING DATA FROM THE API
// ---------------------------------------------------------------------

/**
 * Sends a request to the Visual Crossing Timeline API.
 *
 * The "yesterday/tomorrow" range fetches yesterday, today, and tomorrow
 * (hourly), which is enough for the 24 hours before and the 24 hours
 * after the current time.
 *
 * @param {{type: string, value: string}} query - the location to look up
 * @returns {Promise<object>} - the weather data as a JSON object
 * @throws {Error} - if the response fails; err.status holds the HTTP code
 */
async function fetchWeather(query) {
  const location = encodeURIComponent(query.value);
  const params = new URLSearchParams({
    unitGroup: "metric", // °C and km/h
    include: "hours,current", // hourly data + current conditions
    key: CONFIG.API_KEY,
    contentType: "json",
  });
  const url = `${BASE_URL}/${location}/yesterday/tomorrow?${params}`;

  const res = await fetch(url);
  if (!res.ok) {
    // Keep the HTTP code so it can be turned into a friendly message
    const text = await res.text().catch(() => "");
    const err = new Error(text || res.statusText);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/**
 * Turns an error from fetchWeather() into a user-friendly message.
 * @param {Error & {status?: number}} err - the error thrown by fetchWeather
 * @returns {string} - a message ready to show to the user
 */
function errorMessage(err) {
  switch (err.status) {
    case 400:
      return "Location not found. Try another city name or add the country (e.g. Bandung, Indonesia).";
    case 401:
      return "Invalid API key. Please check the contents of config.js.";
    case 429:
      return "Daily API quota reached. Try again tomorrow or refresh less often.";
    default:
      return "Could not fetch the weather data. Check your internet connection and try again.";
  }
}

// ---------------------------------------------------------------------
// LOADING & DISPLAYING THE WEATHER
// ---------------------------------------------------------------------

/**
 * Main function: loads the weather for a location and displays it.
 * Steps: check API key -> show loading -> fetch data -> render.
 * Used by the search form, the location button, the refresh button, and init().
 *
 * @param {{type: "name"|"coords", value: string}} query - the location to load
 */
async function loadWeather(query) {
  if (!hasApiKey()) {
    setStatus(
      "Please add your Visual Crossing API key to config.js first.",
      "error",
    );
    return;
  }

  currentQuery = query; // remember it so the refresh button knows the location
  const myRequest = ++requestId; // the number of this request

  setLoading(true);
  setStatus("Loading weather data…");

  try {
    const data = await fetchWeather(query);
    if (myRequest !== requestId) return; // a newer request already exists
    render(data, query);
    setStatus("");

    // Remember the location the user typed for the next visit
    if (query.type === "name") {
      try {
        localStorage.setItem(LAST_LOCATION_KEY, query.value);
      } catch {
        /* ignore if the browser blocks storage */
      }
    }
  } catch (err) {
    if (myRequest !== requestId) return;
    console.error(err);
    showEmpty();
    setStatus(errorMessage(err), "error");
  } finally {
    if (myRequest === requestId) setLoading(false);
  }
}

/**
 * Controls the display when loading starts or finishes.
 * - When it starts: buttons are disabled, the refresh icon spins, and
 *   skeleton cards blink in place of the data.
 * - When it finishes: buttons are enabled again and the blinking effect is removed.
 * @param {boolean} isLoading - true when loading starts, false when it finishes
 */
function setLoading(isLoading) {
  els.refreshBtn.disabled = isLoading;
  els.refreshBtn.classList.toggle("spinning", isLoading);
  els.form.querySelector("button[type=submit]").disabled = isLoading;
  els.geoBtn.disabled = isLoading;

  if (isLoading) {
    els.current.classList.remove("hidden", "enter");
    els.current.classList.add("loading");
    showSkeleton(els.nextList);
    showSkeleton(els.prevList);
    els.nextSection.classList.remove("hidden");
    els.prevSection.classList.remove("hidden");
  } else {
    els.current.classList.remove("loading");
  }
}

/**
 * Fills a container with 10 skeleton (placeholder) cards that
 * blink while the data is loading.
 * @param {HTMLElement} container - the hourly list container
 */
function showSkeleton(container) {
  container.innerHTML = "";
  for (let i = 0; i < 10; i++) {
    const div = document.createElement("div");
    div.className = "hour skeleton";
    container.appendChild(div);
  }
}

/**
 * Hides the weather card and both hourly lists.
 * Used when an error occurs so no old data or skeletons are left behind.
 */
function showEmpty() {
  els.current.classList.add("hidden");
  els.nextSection.classList.add("hidden");
  els.prevSection.classList.add("hidden");
}

/**
 * Shows all the weather data on the page:
 *  - the current weather card (temperature, wind, chance of rain, conditions)
 *  - the previous 24 hours and the next 24 hours
 *
 * @param {object} data - the JSON response from fetchWeather()
 * @param {{type: string, value: string}} query - the requested location
 */
function render(data, query) {
  const tz = data.timezone; // the location's time zone, e.g. "Asia/Jakarta"
  const cc = data.currentConditions || {};

  // The "now" time in seconds (epoch). Fallback: the device clock.
  const nowEpoch = cc.datetimeEpoch || Math.floor(Date.now() / 1000);

  // --- Part 1: current weather ---
  const info = iconInfo(cc.icon);
  els.place.textContent =
    query.type === "coords"
      ? `My location (${data.resolvedAddress})`
      : data.resolvedAddress;
  els.updated.textContent = "Updated " + formatDateTime(nowEpoch, tz);
  els.icon.textContent = info.emoji;
  els.temp.textContent = `${round(cc.temp)}°C`;
  els.cond.textContent = cc.conditions || info.label;
  els.wind.textContent = `${round(cc.windspeed)} km/h`;
  els.rain.textContent = `${round(cc.precipprob ?? 0)}%`;
  els.humidity.textContent = `${round(cc.humidity)}%`;

  els.current.classList.remove("hidden", "loading");
  restartAnimation(els.current, "enter");

  // --- Part 2: hourly lists ---
  // Combine the hours from all days (yesterday, today, tomorrow) and sort them
  const allHours = data.days
    .flatMap((day) => day.hours || [])
    .sort((a, b) => a.datetimeEpoch - b.datetimeEpoch);

  // The last 24 hours up to now, and the 24 hours after now
  const past = allHours.filter((h) => h.datetimeEpoch <= nowEpoch).slice(-24);
  const future = allHours
    .filter((h) => h.datetimeEpoch > nowEpoch)
    .slice(0, 24);

  renderHours(els.nextList, future, tz);
  renderHours(els.prevList, past, tz);
  els.nextSection.classList.remove("hidden");
  els.prevSection.classList.remove("hidden");
}

/**
 * Builds the hourly cards inside a container. Each card shows the
 * time, date, icon, temperature, chance of rain, and wind speed.
 * Cards appear one after another through the CSS variable --i (animation delay).
 *
 * @param {HTMLElement} container - the list container (nextList / prevList)
 * @param {object[]} hours - array of hourly data from the API
 * @param {string} tz - the location's time zone
 */
function renderHours(container, hours, tz) {
  container.innerHTML = "";
  hours.forEach((h, i) => {
    const info = iconInfo(h.icon);
    const card = document.createElement("div");
    card.className = "hour enter";
    card.style.setProperty("--i", i); // order, used for the animation delay
    card.title = h.conditions || info.label; // tooltip when the cursor hovers

    card.append(
      makeEl("div", "time", formatHour(h.datetimeEpoch, tz)),
      makeEl("div", "day", formatDay(h.datetimeEpoch, tz)),
      makeEl("div", "icon", info.emoji),
      makeEl("div", "temp", `${round(h.temp)}°C`),
      makeEl("div", "meta", `🌧 ${round(h.precipprob ?? 0)}%`),
      makeEl("div", "meta", `💨 ${round(h.windspeed)} km/h`),
    );
    container.appendChild(card);
  });
}

/**
 * Creates a single HTML element containing text.
 * Uses textContent (not innerHTML), so it is safe from HTML injection.
 * @param {string} tag - the tag name, e.g. "div"
 * @param {string} className - the CSS class for the element
 * @param {string} text - the text content
 * @returns {HTMLElement} - the finished element
 */
function makeEl(tag, className, text) {
  const el = document.createElement(tag);
  el.className = className;
  el.textContent = text;
  return el;
}

// ---------------------------------------------------------------------
// TIME FORMATTING (follows the time zone of the searched location)
// ---------------------------------------------------------------------

/**
 * Formats the hour only, e.g. "14:00".
 * @param {number} epoch - time in seconds since 1 Jan 1970 (UTC)
 * @param {string} tz - time zone, e.g. "Asia/Jakarta"
 * @returns {string} - the time in 24-hour format
 */
function formatHour(epoch, tz) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23", // 24-hour clock, midnight shown as 00:00
    timeZone: tz,
  }).format(new Date(epoch * 1000));
}

/**
 * Formats a short day and date, e.g. "Tue, Nov 3".
 * @param {number} epoch - time in seconds (UTC)
 * @param {string} tz - the location's time zone
 * @returns {string} - short day and date
 */
function formatDay(epoch, tz) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: tz,
  }).format(new Date(epoch * 1000));
}

/**
 * Formats the full day, date, and time, e.g. "Tuesday, November 3 at 12:00".
 * Used for the "Updated ..." text on the current weather card.
 * @param {number} epoch - time in seconds (UTC)
 * @param {string} tz - the location's time zone
 * @returns {string} - the full date and time
 */
function formatDateTime(epoch, tz) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: tz,
  }).format(new Date(epoch * 1000));
}

// ---------------------------------------------------------------------
// GEOLOCATION (stretch goal: the user's current location)
// ---------------------------------------------------------------------

/**
 * Asks the browser for the device's coordinates (a permission dialog appears).
 * Only works on HTTPS or localhost.
 * @returns {Promise<string>} - coordinates as "lat,lon", e.g. "-6.2000,106.8167"
 * @throws - if unsupported, permission is denied, or it times out (8 seconds)
 */
function getBrowserCoords() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve(
          `${pos.coords.latitude.toFixed(4)},${pos.coords.longitude.toFixed(4)}`,
        ),
      reject,
      { timeout: 8000, maximumAge: 10 * 60 * 1000 }, // a result from the last 10 minutes is fine
    );
  });
}

/**
 * Called when the 📍 button is clicked: gets the device location and then
 * loads its weather. If that fails, show a message so the user types it in manually.
 */
async function useMyLocation() {
  setStatus("Finding your location…");
  try {
    const coords = await getBrowserCoords();
    els.input.value = ""; // clear the input since coordinates are being used
    await loadWeather({ type: "coords", value: coords });
  } catch {
    setStatus(
      "Could not access your location (permission denied, or not on HTTPS/localhost). Please enter a location manually.",
      "error",
    );
  }
}

// ---------------------------------------------------------------------
// EVENT LISTENERS (reacting to user actions)
// ---------------------------------------------------------------------

// Search form: look up the weather for the typed location
els.form.addEventListener("submit", (e) => {
  e.preventDefault(); // stop the page from reloading
  const value = els.input.value.trim();
  if (value) loadWeather({ type: "name", value });
});

// 📍 button: use the device location
els.geoBtn.addEventListener("click", useMyLocation);

// Refresh button: reload the location currently shown
els.refreshBtn.addEventListener("click", () => {
  if (currentQuery) loadWeather(currentQuery);
});

// ---------------------------------------------------------------------
// START THE APP
// ---------------------------------------------------------------------

/**
 * Called once when the page opens.
 * Order of the starting location:
 *   1. the device location (if permission is granted)
 *   2. the last location searched (localStorage)
 *   3. DEFAULT_LOCATION ("Jakarta")
 */
async function init() {
  if (!hasApiKey()) {
    setStatus(
      "Please add your Visual Crossing API key to config.js first.",
      "error",
    );
    return;
  }

  try {
    const coords = await getBrowserCoords();
    loadWeather({ type: "coords", value: coords });
  } catch {
    let fallback = DEFAULT_LOCATION;
    try {
      fallback = localStorage.getItem(LAST_LOCATION_KEY) || DEFAULT_LOCATION;
    } catch {
      /* ignore if storage is blocked */
    }
    els.input.value = fallback;
    loadWeather({ type: "name", value: fallback });
  }
}

init();
