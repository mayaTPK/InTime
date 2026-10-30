"use strict";

(() => {
  const fallbackZones = [
    "Africa/Abidjan", "Africa/Accra", "Africa/Addis_Ababa", "Africa/Cairo",
    "Africa/Casablanca", "Africa/Harare", "Africa/Johannesburg", "Africa/Lagos",
    "Africa/Maputo", "Africa/Nairobi", "America/Anchorage", "America/Argentina/Buenos_Aires",
    "America/Bogota", "America/Chicago", "America/Denver", "America/Los_Angeles",
    "America/Mexico_City", "America/New_York", "America/Phoenix", "America/Santiago",
    "America/Sao_Paulo", "America/St_Johns", "America/Toronto", "America/Vancouver",
    "Asia/Bangkok", "Asia/Dubai", "Asia/Hong_Kong", "Asia/Jakarta", "Asia/Jerusalem",
    "Asia/Karachi", "Asia/Kathmandu", "Asia/Kolkata", "Asia/Manila", "Asia/Seoul",
    "Asia/Shanghai", "Asia/Singapore", "Asia/Tokyo", "Atlantic/Azores",
    "Australia/Adelaide", "Australia/Brisbane", "Australia/Darwin", "Australia/Melbourne",
    "Australia/Perth", "Australia/Sydney", "Etc/UTC", "Europe/Amsterdam",
    "Europe/Athens", "Europe/Berlin", "Europe/Istanbul", "Europe/London",
    "Europe/Moscow", "Europe/Paris", "Europe/Rome", "Europe/Stockholm",
    "Europe/Zurich", "Pacific/Auckland", "Pacific/Fiji", "Pacific/Honolulu"
  ];
  const zones = [...new Set([
    "Etc/UTC",
    ...(typeof Intl.supportedValuesOf === "function"
      ? Intl.supportedValuesOf("timeZone")
      : fallbackZones)
  ])].sort((a, b) => a.localeCompare(b));
  const zoneAbbreviations = new Map([
    ["Africa/Blantyre", "CAT"],
    ["Africa/Bujumbura", "CAT"],
    ["Africa/Gaborone", "CAT"],
    ["Africa/Harare", "CAT"],
    ["Africa/Kigali", "CAT"],
    ["Africa/Lubumbashi", "CAT"],
    ["Africa/Lusaka", "CAT"],
    ["Africa/Maputo", "CAT"]
  ]);
  const storageKey = "intime.homeTimeZone";
  const sourceSelect = document.getElementById("source-zone");
  const homeSelect = document.getElementById("home-zone");
  const dateInput = document.getElementById("event-date");
  const timeInput = document.getElementById("event-time");
  const errorMessage = document.getElementById("conversion-error");
  const resultContent = document.getElementById("result-content");
  const ambiguityPanel = document.getElementById("ambiguity");
  const ambiguityOptions = document.getElementById("ambiguity-options");
  const timeFormatters = new Map();
  const offsetFormatters = new Map();
  const partsFormatters = new Map();
  const zoneNameFormatters = new Map();
  const zoneOptionLabels = new Map();
  let lastInstant = null;

  function getValidZone(zone) {
    try {
      return new Intl.DateTimeFormat("en", { timeZone: zone }).resolvedOptions().timeZone;
    } catch {
      return null;
    }
  }

  function getInitialHomeZone() {
    try {
      const saved = getValidZone(localStorage.getItem(storageKey));
      if (saved) return saved;
    } catch {
      // Storage is optional; the detected time zone remains available.
    }
    return getValidZone(Intl.DateTimeFormat().resolvedOptions().timeZone) || "Etc/UTC";
  }

  function partsAt(instant, zone) {
    if (!partsFormatters.has(zone)) {
      partsFormatters.set(zone, new Intl.DateTimeFormat("en-US-u-ca-gregory-nu-latn", {
        timeZone: zone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23"
      }));
    }
    return Object.fromEntries(partsFormatters.get(zone).formatToParts(instant)
      .filter(part => part.type !== "literal")
      .map(part => [part.type, Number(part.value)]));
  }

  function utcTimestamp(year, month, day, hour = 0, minute = 0, second = 0) {
    const date = new Date(0);
    date.setUTCFullYear(year, month - 1, day);
    date.setUTCHours(hour, minute, second, 0);
    return date.getTime();
  }

  function offsetAt(instant, zone) {
    const parts = partsAt(instant, zone);
    const localAsUtc = utcTimestamp(
      parts.year, parts.month, parts.day, parts.hour, parts.minute, parts.second
    );
    return localAsUtc - Math.floor(instant.getTime() / 1000) * 1000;
  }

  function offsetLabel(offset) {
    const minutes = Math.round(offset / 60_000);
    const sign = minutes < 0 ? "−" : "+";
    const absolute = Math.abs(minutes);
    return `UTC${sign}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`;
  }

  function formatZoneName(instant, zone, style) {
    const key = `${zone}|${style}`;
    if (!zoneNameFormatters.has(key)) {
      zoneNameFormatters.set(key, new Intl.DateTimeFormat("en", {
        timeZone: zone,
        timeZoneName: style
      }));
    }
    return zoneNameFormatters.get(key).formatToParts(instant).find(part => part.type === "timeZoneName")?.value
      || offsetLabel(offsetAt(instant, zone));
  }

  function getOffsetFormatter(zone) {
    if (!offsetFormatters.has(zone)) {
      offsetFormatters.set(zone, new Intl.DateTimeFormat("en", {
        timeZone: zone,
        timeZoneName: "longGeneric"
      }));
    }
    return offsetFormatters.get(zone);
  }

  function optionLabel(zone) {
    if (zoneOptionLabels.has(zone)) return zoneOptionLabels.get(zone);
    const now = new Date();
    const genericName = getOffsetFormatter(zone)
      .formatToParts(now)
      .find(part => part.type === "timeZoneName")?.value || zone;
    const name = zone === "Etc/UTC"
      ? "Coordinated Universal Time"
      : genericName.replace(/\s+\(GMT[^)]*\)$/, "");
    const offsetText = formatZoneName(now, zone, "longOffset");
    const offset = offsetText === "GMT" ? "UTC+00:00" : offsetText.replace(/^GMT/, "UTC");
    const abbreviation = zoneAbbreviations.get(zone)
      || (zone === "Europe/London"
        ? "GMT/BST"
        : zone === "Etc/UTC"
          ? "UTC"
          : formatZoneName(now, zone, "shortGeneric"));
    const region = zone.split("/")[0].replace(/^Etc$/, "UTC");
    const label = `${abbreviation} — ${name} · ${offset} · ${region}`;
    zoneOptionLabels.set(zone, label);
    return label;
  }

  function populateZones(select, selectedZone) {
    const fragment = document.createDocumentFragment();
    for (const zone of zones) {
      const option = document.createElement("option");
      option.value = zone;
      option.textContent = optionLabel(zone);
      option.selected = zone === selectedZone;
      fragment.append(option);
    }
    select.replaceChildren(fragment);
  }

  function readWallTime() {
    if (!dateInput.value || !timeInput.value) return null;
    const [year, month, day] = dateInput.value.split("-").map(Number);
    const [hour, minute] = timeInput.value.split(":").map(Number);
    if (![year, month, day, hour, minute].every(Number.isFinite)) return null;
    return { year, month, day, hour, minute };
  }

  function findInstants(wallTime, zone) {
    const wallTimestamp = utcTimestamp(
      wallTime.year, wallTime.month, wallTime.day, wallTime.hour, wallTime.minute
    );
    const offsets = new Set();
    for (let hours = -36; hours <= 36; hours += 3) {
      offsets.add(offsetAt(new Date(wallTimestamp + hours * 3_600_000), zone));
    }

    return [...offsets]
      .map(offset => new Date(wallTimestamp - offset))
      .filter(instant => {
        const parts = partsAt(instant, zone);
        return parts.year === wallTime.year
          && parts.month === wallTime.month
          && parts.day === wallTime.day
          && parts.hour === wallTime.hour
          && parts.minute === wallTime.minute
          && parts.second === 0;
      })
      .sort((a, b) => a - b);
  }

  function formatTime(instant, zone) {
    if (!timeFormatters.has(zone)) {
      timeFormatters.set(zone, new Intl.DateTimeFormat(undefined, {
        timeZone: zone,
        hour: "numeric",
        minute: "2-digit"
      }));
    }
    return timeFormatters.get(zone).format(instant);
  }

  function clearAmbiguity() {
    ambiguityPanel.hidden = true;
    ambiguityOptions.replaceChildren();
  }

  function displayResult(instant, occurrenceCount = 1) {
    const zone = homeSelect.value;
    const offset = offsetAt(instant, zone);
    const resultParts = partsAt(instant, zone);
    const sourceParts = partsAt(instant, sourceSelect.value);
    const dayDelta = Math.round((
      utcTimestamp(resultParts.year, resultParts.month, resultParts.day)
      - utcTimestamp(sourceParts.year, sourceParts.month, sourceParts.day)
    ) / 86_400_000);
    const dayNote = dayDelta === 0
      ? ""
      : ` · ${dayDelta > 0 ? "+" : ""}${dayDelta} ${Math.abs(dayDelta) === 1 ? "day" : "days"}`;

    document.getElementById("result-time").textContent = formatTime(instant, zone);
    document.getElementById("result-zone").textContent =
      `${formatZoneName(instant, zone, "long")} · ${offsetLabel(offset)}`;
    document.getElementById("result-date").textContent =
      new Intl.DateTimeFormat(undefined, {
        timeZone: zone,
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric"
      }).format(instant) + dayNote;

    if (occurrenceCount > 1) {
      document.getElementById("result-zone").textContent += " · selected occurrence";
    }
  }

  function convert() {
    errorMessage.hidden = true;
    clearAmbiguity();
    const wallTime = readWallTime();
    if (!wallTime) return;

    const instants = findInstants(wallTime, sourceSelect.value);
    if (instants.length === 0) {
      resultContent.hidden = true;
      errorMessage.textContent = "That local time does not exist because the clocks move forward. Choose another time.";
      errorMessage.hidden = false;
      return;
    }

    resultContent.hidden = false;
    lastInstant = instants[0];
    displayResult(lastInstant, instants.length);
    if (instants.length < 2) return;

    ambiguityPanel.hidden = false;
    instants.forEach((instant, index) => {
      const button = document.createElement("button");
      button.className = "ambiguity-option";
      button.type = "button";
      button.setAttribute("aria-pressed", String(index === 0));
      button.textContent = `${index === 0 ? "First" : "Second"} · ${offsetLabel(offsetAt(instant, sourceSelect.value))}`;
      button.addEventListener("click", () => {
        ambiguityOptions.querySelectorAll("button").forEach((option, optionIndex) => {
          option.setAttribute("aria-pressed", String(index === optionIndex));
        });
        lastInstant = instant;
        displayResult(instant, instants.length);
      });
      ambiguityOptions.append(button);
    });
  }

  function setLocalInputs(instant, zone) {
    const parts = partsAt(instant, zone);
    dateInput.value = `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
    timeInput.value = `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
  }

  const homeZone = getInitialHomeZone();
  populateZones(sourceSelect, "Etc/UTC");
  populateZones(homeSelect, homeZone);
  const now = new Date();
  setLocalInputs(now, sourceSelect.value);
  document.getElementById("converter-form").addEventListener("submit", event => {
    event.preventDefault();
    convert();
  });
  dateInput.addEventListener("input", convert);
  timeInput.addEventListener("input", convert);
  sourceSelect.addEventListener("change", convert);
  homeSelect.addEventListener("change", () => {
    try {
      localStorage.setItem(storageKey, homeSelect.value);
    } catch {
      // The selected zone still applies for this visit when storage is unavailable.
    }
    convert();
  });
  document.getElementById("swap-zones").addEventListener("click", () => {
    const previousSource = sourceSelect.value;
    sourceSelect.value = homeSelect.value;
    homeSelect.value = previousSource;
    if (lastInstant) setLocalInputs(lastInstant, sourceSelect.value);
    try {
      localStorage.setItem(storageKey, homeSelect.value);
    } catch {
      // The selected zone still applies for this visit when storage is unavailable.
    }
    convert();
  });
  convert();

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(error => {
        console.error("InTime could not register its offline cache.", error);
      });
    });
  }
})();
