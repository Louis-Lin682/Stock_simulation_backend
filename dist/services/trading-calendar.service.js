"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMarketTimeZone = getMarketTimeZone;
exports.getMarketOpenMinutes = getMarketOpenMinutes;
exports.getMarketCloseMinutes = getMarketCloseMinutes;
exports.getMarketDateInfo = getMarketDateInfo;
exports.getMarketCalendar = getMarketCalendar;
exports.isMarketBusinessDay = isMarketBusinessDay;
exports.getNextBusinessDayDateKey = getNextBusinessDayDateKey;
exports.getOrderEffectiveDateKey = getOrderEffectiveDateKey;
exports.isMarketSessionOpen = isMarketSessionOpen;
exports.shouldAttemptPendingOrderFill = shouldAttemptPendingOrderFill;
exports.isDayOrderExpired = isDayOrderExpired;
exports.serializeOrderTiming = serializeOrderTiming;
const TWSE_HOLIDAY_URL = "https://www.twse.com.tw/holidaySchedule/holidaySchedule";
const twHolidayCache = new Map();
const usHolidayCache = new Map();
function pad(value) {
    return String(value).padStart(2, "0");
}
function toDateKey(year, month, day) {
    return `${year}-${pad(month)}-${pad(day)}`;
}
function stripHtml(value) {
    return value.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}
function getMarketTimeZone(market) {
    return market === "US" ? "America/New_York" : "Asia/Taipei";
}
function getMarketOpenMinutes(market) {
    return market === "US" ? 9 * 60 + 30 : 9 * 60;
}
function getMarketCloseMinutes(market) {
    return market === "US" ? 16 * 60 : 13 * 60 + 30;
}
function getMarketDateInfo(date, market) {
    const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: getMarketTimeZone(market),
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    });
    const parts = formatter.formatToParts(date);
    const year = parts.find((part) => part.type === "year")?.value ?? "0000";
    const month = parts.find((part) => part.type === "month")?.value ?? "01";
    const day = parts.find((part) => part.type === "day")?.value ?? "01";
    const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
    const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
    return {
        dateKey: `${year}-${month}-${day}`,
        minutes: hour * 60 + minute,
        year: Number(year),
    };
}
function isWeekend(year, month, day) {
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    return weekday === 0 || weekday === 6;
}
function nthWeekdayOfMonth(year, month, weekday, nth) {
    const firstDay = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
    const offset = (weekday - firstDay + 7) % 7;
    return 1 + offset + (nth - 1) * 7;
}
function lastWeekdayOfMonth(year, month, weekday) {
    const lastDate = new Date(Date.UTC(year, month, 0));
    const lastDay = lastDate.getUTCDay();
    const offset = (lastDay - weekday + 7) % 7;
    return lastDate.getUTCDate() - offset;
}
function observedFixedHoliday(year, month, day, options) {
    const date = new Date(Date.UTC(year, month - 1, day));
    const weekday = date.getUTCDay();
    if (weekday === 6) {
        if (options?.saturdayMode === "none") {
            return null;
        }
        return toDateKey(year, month, day - 1);
    }
    if (weekday === 0) {
        return toDateKey(year, month, day + 1);
    }
    return toDateKey(year, month, day);
}
function easterSundayUtc(year) {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(Date.UTC(year, month - 1, day));
}
function addDaysUtc(date, days) {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
}
function buildUsHolidayDateKeys(year) {
    const holidays = new Set();
    const addIfPresent = (value) => {
        if (value)
            holidays.add(value);
    };
    addIfPresent(observedFixedHoliday(year, 1, 1, { saturdayMode: "none" }));
    holidays.add(toDateKey(year, 1, nthWeekdayOfMonth(year, 1, 1, 3)));
    holidays.add(toDateKey(year, 2, nthWeekdayOfMonth(year, 2, 1, 3)));
    const goodFriday = addDaysUtc(easterSundayUtc(year), -2);
    holidays.add(toDateKey(goodFriday.getUTCFullYear(), goodFriday.getUTCMonth() + 1, goodFriday.getUTCDate()));
    holidays.add(toDateKey(year, 5, lastWeekdayOfMonth(year, 5, 1)));
    addIfPresent(observedFixedHoliday(year, 6, 19));
    addIfPresent(observedFixedHoliday(year, 7, 4));
    holidays.add(toDateKey(year, 9, nthWeekdayOfMonth(year, 9, 1, 1)));
    holidays.add(toDateKey(year, 11, nthWeekdayOfMonth(year, 11, 4, 4)));
    addIfPresent(observedFixedHoliday(year, 12, 25));
    return holidays;
}
function getUsHolidayDateKeys(year) {
    if (!usHolidayCache.has(year)) {
        usHolidayCache.set(year, buildUsHolidayDateKeys(year));
    }
    return usHolidayCache.get(year);
}
function shouldIncludeTwHoliday(name, description) {
    const combined = `${name} ${description}`;
    return !combined.includes("�}�l���") && !combined.includes("�̫���");
}
async function loadTwHolidayDateKeys(year) {
    try {
        const url = new URL(TWSE_HOLIDAY_URL);
        url.searchParams.set("queryYear", String(year - 1911));
        url.searchParams.set("response", "html");
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch TWSE holiday schedule: ${response.status}`);
        }
        const html = await response.text();
        const holidays = new Set();
        const rowPattern = /<tr[^>]*>\s*<td[^>]*>\s*(\d{4}-\d{2}-\d{2})\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/gi;
        let match = rowPattern.exec(html);
        while (match) {
            const [, dateKey, rawName, rawDescription] = match;
            const name = stripHtml(rawName);
            const description = stripHtml(rawDescription);
            if (shouldIncludeTwHoliday(name, description)) {
                holidays.add(dateKey);
            }
            match = rowPattern.exec(html);
        }
        return holidays;
    }
    catch (error) {
        console.warn(`Failed to load TWSE holiday schedule for ${year}`, error);
        return new Set();
    }
}
async function getTwHolidayDateKeys(year) {
    if (!twHolidayCache.has(year)) {
        twHolidayCache.set(year, loadTwHolidayDateKeys(year));
    }
    return twHolidayCache.get(year);
}
async function getMarketCalendar(market, year) {
    if (market === "US") {
        return {
            market,
            year,
            source: "NYSE holiday schedule (calculated)",
            holidays: Array.from(getUsHolidayDateKeys(year)).sort((a, b) => a.localeCompare(b)),
        };
    }
    return {
        market,
        year,
        source: "TWSE holiday schedule",
        holidays: Array.from(await getTwHolidayDateKeys(year)).sort((a, b) => a.localeCompare(b)),
    };
}
async function isMarketBusinessDay(date, market) {
    const info = getMarketDateInfo(date, market);
    const [year, month, day] = info.dateKey.split("-").map(Number);
    if (isWeekend(year, month, day)) {
        return false;
    }
    if (market === "US") {
        return !getUsHolidayDateKeys(info.year).has(info.dateKey);
    }
    const holidays = await getTwHolidayDateKeys(info.year);
    return !holidays.has(info.dateKey);
}
async function getNextBusinessDayDateKey(date, market) {
    const cursor = new Date(date);
    for (let index = 0; index < 366; index += 1) {
        cursor.setUTCDate(cursor.getUTCDate() + 1);
        if (await isMarketBusinessDay(cursor, market)) {
            return getMarketDateInfo(cursor, market).dateKey;
        }
    }
    return getMarketDateInfo(cursor, market).dateKey;
}
async function getOrderEffectiveDateKey(order) {
    const market = order.market === "US" ? "US" : "TW";
    const createdInfo = getMarketDateInfo(order.createdAt, market);
    if ((await isMarketBusinessDay(order.createdAt, market)) && createdInfo.minutes < getMarketCloseMinutes(market)) {
        return createdInfo.dateKey;
    }
    return getNextBusinessDayDateKey(order.createdAt, market);
}
async function isMarketSessionOpen(market, now = new Date()) {
    if (!(await isMarketBusinessDay(now, market))) {
        return false;
    }
    const nowInfo = getMarketDateInfo(now, market);
    return nowInfo.minutes >= getMarketOpenMinutes(market) && nowInfo.minutes < getMarketCloseMinutes(market);
}
async function shouldAttemptPendingOrderFill(order, now = new Date()) {
    const market = order.market === "US" ? "US" : "TW";
    if (!(await isMarketSessionOpen(market, now))) {
        return false;
    }
    const nowInfo = getMarketDateInfo(now, market);
    const effectiveDateKey = await getOrderEffectiveDateKey(order);
    return nowInfo.dateKey >= effectiveDateKey;
}
async function isDayOrderExpired(order, now = new Date()) {
    const market = order.market === "US" ? "US" : "TW";
    const effectiveDateKey = await getOrderEffectiveDateKey(order);
    const nowInfo = getMarketDateInfo(now, market);
    if (nowInfo.dateKey > effectiveDateKey) {
        return true;
    }
    if (nowInfo.dateKey < effectiveDateKey) {
        return false;
    }
    return nowInfo.minutes >= getMarketCloseMinutes(market);
}
async function serializeOrderTiming(order) {
    const market = order.market === "US" ? "US" : "TW";
    const createdInfo = getMarketDateInfo(order.createdAt, market);
    const effectiveDate = await getOrderEffectiveDateKey(order);
    return {
        effectiveDate,
        isNextSessionOrder: order.status === "PENDING" && effectiveDate > createdInfo.dateKey,
    };
}
