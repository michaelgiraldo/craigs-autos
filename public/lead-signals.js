(function () {
  var OUTPUTS_PATH = '/amplify_outputs.json';
  var STORAGE_KEY = 'craigs_attribution_v1';
  var USER_KEY = 'chatkit-user-id';
  var endpointCache = null;
  var endpointPromise = null;

  function safeJsonParse(value) {
    try {
      return JSON.parse(value);
    } catch (e) {
      return null;
    }
  }

  function readStorage() {
    try {
      var raw = window.localStorage ? window.localStorage.getItem(STORAGE_KEY) : null;
      if (!raw) return null;
      var parsed = safeJsonParse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (e) {
      return null;
    }
  }

  function readCookie(name) {
    var cookies = document.cookie ? document.cookie.split(';') : [];
    for (var i = 0; i < cookies.length; i++) {
      var parts = cookies[i].split('=');
      var key = parts[0] ? parts[0].trim() : '';
      if (key === name) {
        return decodeURIComponent(parts.slice(1).join('=') || '').trim() || null;
      }
    }
    return null;
  }

  function getAttribution() {
    var stored = readStorage() || {};
    var first = stored.first_touch || {};
    var last = stored.last_touch || first;

    var payload = {
      gclid: last.gclid || first.gclid || readCookie('gclid'),
      gbraid: last.gbraid || first.gbraid || readCookie('gbraid'),
      wbraid: last.wbraid || first.wbraid || readCookie('wbraid'),
      utm_source: last.utm_source || first.utm_source || null,
      utm_medium: last.utm_medium || first.utm_medium || null,
      utm_campaign: last.utm_campaign || first.utm_campaign || null,
      utm_term: last.utm_term || first.utm_term || null,
      utm_content: last.utm_content || first.utm_content || null,
      first_touch_ts: first.ts || null,
      last_touch_ts: last.ts || null,
      landing_page: stored.landing_page || window.location.pathname,
      referrer: stored.referrer || document.referrer || null,
    };

    var hasAny = false;
    for (var k in payload) {
      if (payload[k]) {
        hasAny = true;
        break;
      }
    }
    return hasAny ? payload : null;
  }

  function getUserId() {
    try {
      return window.localStorage ? window.localStorage.getItem(USER_KEY) : null;
    } catch (e) {
      return null;
    }
  }

  function resolveEndpoint() {
    if (endpointCache) return Promise.resolve(endpointCache);
    if (endpointPromise) return endpointPromise;
    endpointPromise = fetch(OUTPUTS_PATH, { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) return null;
        return res.json();
      })
      .then(function (data) {
        var url = data && data.custom && data.custom.chatkit_lead_signal_url;
        if (typeof url === 'string' && url.trim()) {
          endpointCache = url.trim();
          return endpointCache;
        }
        return null;
      })
      .catch(function () {
        return null;
      });
    return endpointPromise;
  }

  function sendSignal(payload) {
    resolveEndpoint().then(function (endpoint) {
      if (!endpoint) return;
      var body = JSON.stringify(payload);
      if (navigator.sendBeacon) {
        try {
          var blob = new Blob([body], { type: 'application/json' });
          navigator.sendBeacon(endpoint, blob);
          return;
        } catch (e) {
          // fall through
        }
      }
      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
        body: body,
      }).catch(function () {});
    });
  }

  function handleClick(event) {
    var el = event.target;
    if (!el) return;
    if (el.closest) {
      el = el.closest('a');
    }
    if (!el || !el.getAttribute) return;
    var href = el.getAttribute('href') || '';
    if (!href) return;

    var eventName = null;
    var provider = null;
    if (href.indexOf('tel:') === 0) {
      eventName = 'lead_click_to_call';
    } else if (href.indexOf('sms:') === 0) {
      eventName = 'lead_click_to_text';
    } else if (href.indexOf('https://www.google.com/maps/dir/') === 0) {
      eventName = 'lead_click_directions';
      provider = 'google_maps';
    } else if (href.indexOf('https://maps.apple.com/') === 0) {
      eventName = 'lead_click_directions';
      provider = 'apple_maps';
    }

    if (!eventName) return;

    var payload = {
      event: eventName,
      pageUrl: window.location.href,
      user: getUserId(),
      locale: document.documentElement ? document.documentElement.lang : null,
      clickUrl: href,
      provider: provider,
      attribution: getAttribution(),
    };

    sendSignal(payload);
  }

  document.addEventListener('click', handleClick, { capture: true });
})();
