const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function weekdayToIndex(value) {
  const idx = WEEKDAYS.indexOf(value);
  return idx === -1 ? 0 : idx;
}

function minutesFromParts(hour, minute) {
  return hour * 60 + minute;
}

function formatTime12h(totalMinutes) {
  const hour24 = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  const suffix = hour24 >= 12 ? 'PM' : 'AM';
  let hour12 = hour24 % 12;
  if (hour12 === 0) hour12 = 12;
  return `${hour12}:${String(minute).padStart(2, '0')} ${suffix}`;
}

function scheduleForWeekday(weekday) {
  switch (weekday) {
    case 'Monday':
    case 'Tuesday':
    case 'Wednesday':
    case 'Thursday':
    case 'Friday':
      return { open: minutesFromParts(8, 0), close: minutesFromParts(17, 0) };
    case 'Saturday':
      return { open: minutesFromParts(8, 0), close: minutesFromParts(14, 0) };
    default:
      return null;
  }
}

export function computeShopState(now, timezone) {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'long',
  }).format(now);

  const timeParts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);

  const hour = Number.parseInt(timeParts.find((p) => p.type === 'hour')?.value ?? '0', 10);
  const minute = Number.parseInt(timeParts.find((p) => p.type === 'minute')?.value ?? '0', 10);
  const localTime24h = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  const nowMinutes = minutesFromParts(hour, minute);

  const todaySchedule = scheduleForWeekday(weekday);
  const isOpenNow = todaySchedule
    ? nowMinutes >= todaySchedule.open && nowMinutes < todaySchedule.close
    : false;

  const weekdayIndex = weekdayToIndex(weekday);
  let nextOpenDay = '';
  let nextOpenTime = '';

  for (let offset = 0; offset < 8; offset += 1) {
    const dayIndex = (weekdayIndex + offset) % 7;
    const dayName = WEEKDAYS[dayIndex];
    const schedule = scheduleForWeekday(dayName);
    if (!schedule) continue;

    if (offset === 0) {
      if (nowMinutes < schedule.open) {
        nextOpenDay = dayName;
        nextOpenTime = formatTime12h(schedule.open);
        break;
      }
      continue;
    }

    nextOpenDay = dayName;
    nextOpenTime = formatTime12h(schedule.open);
    break;
  }

  return {
    shop_timezone: timezone,
    shop_local_weekday: weekday,
    shop_local_time_24h: localTime24h,
    shop_is_open_now: isOpenNow,
    shop_next_open_day: nextOpenDay,
    shop_next_open_time: nextOpenTime,
  };
}
