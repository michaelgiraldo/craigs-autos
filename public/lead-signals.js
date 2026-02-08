(function () {
  var OUTPUTS_PATH = '/amplify_outputs.json';
  var STORAGE_KEY = 'craigs_attribution_v1';
  var USER_KEY = 'chatkit-user-id';
  var PAID_LANDING_SESSION_KEY = 'craigs_paid_landing_seen_v1';
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
    var deviceType = null;
    try {
      deviceType = window.matchMedia('(max-width: 900px)').matches ? 'mobile' : 'desktop';
    } catch (e) {
      deviceType = null;
    }

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
      device_type: deviceType,
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
          var sent = navigator.sendBeacon(endpoint, body);
          if (sent) return;
        } catch (e) {
          // fall through
        }
      }
      fetch(endpoint, {
        method: 'POST',
        mode: 'no-cors',
        keepalive: true,
        body: body,
      }).catch(function () {});
    });
  }

  function pushDataLayer(eventName, params) {
    try {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push(Object.assign({ event: eventName }, params || {}));
    } catch (e) {
      // Ignore analytics failures.
    }
  }

  function getUrlAttributionParams() {
    try {
      var p = new URLSearchParams(window.location.search || '');
      return {
        gclid: p.get('gclid') || null,
        gbraid: p.get('gbraid') || null,
        wbraid: p.get('wbraid') || null,
        utm_source: p.get('utm_source') || null,
        utm_medium: p.get('utm_medium') || null,
        utm_campaign: p.get('utm_campaign') || null,
        utm_term: p.get('utm_term') || null,
        utm_content: p.get('utm_content') || null,
      };
    } catch (e) {
      return {
        gclid: null,
        gbraid: null,
        wbraid: null,
        utm_source: null,
        utm_medium: null,
        utm_campaign: null,
        utm_term: null,
        utm_content: null,
      };
    }
  }

  function hasPaidClickId(params) {
    return Boolean(params && (params.gclid || params.gbraid || params.wbraid));
  }

  function attributionForDataLayer(attribution) {
    var a = attribution || {};
    return {
      gclid: a.gclid || null,
      gbraid: a.gbraid || null,
      wbraid: a.wbraid || null,
      utm_source: a.utm_source || null,
      utm_medium: a.utm_medium || null,
      utm_campaign: a.utm_campaign || null,
      utm_term: a.utm_term || null,
      utm_content: a.utm_content || null,
      device_type: a.device_type || null,
    };
  }

  function markPaidLandingSeen(signature) {
    try {
      if (!signature || !window.sessionStorage) return;
      window.sessionStorage.setItem(PAID_LANDING_SESSION_KEY, signature);
    } catch (e) {
      // Ignore storage failures.
    }
  }

  function wasPaidLandingSeen(signature) {
    try {
      if (!signature || !window.sessionStorage) return false;
      return window.sessionStorage.getItem(PAID_LANDING_SESSION_KEY) === signature;
    } catch (e) {
      return false;
    }
  }

  function handlePaidLanding() {
    var params = getUrlAttributionParams();
    if (!hasPaidClickId(params)) return;

    var attribution = getAttribution() || {};
    if (params.gclid) attribution.gclid = params.gclid;
    if (params.gbraid) attribution.gbraid = params.gbraid;
    if (params.wbraid) attribution.wbraid = params.wbraid;
    if (params.utm_source) attribution.utm_source = params.utm_source;
    if (params.utm_medium) attribution.utm_medium = params.utm_medium;
    if (params.utm_campaign) attribution.utm_campaign = params.utm_campaign;
    if (params.utm_term) attribution.utm_term = params.utm_term;
    if (params.utm_content) attribution.utm_content = params.utm_content;

    var signature = [params.gclid || '', params.gbraid || '', params.wbraid || '', window.location.pathname].join('|');
    if (wasPaidLandingSeen(signature)) return;

    var payload = {
      event: 'lead_ad_landing',
      pageUrl: window.location.href,
      user: getUserId(),
      locale: document.documentElement ? document.documentElement.lang : null,
      clickUrl: window.location.href,
      provider: 'google_ads',
      attribution: attribution,
    };

    pushDataLayer('lead_ad_landing', Object.assign({
      lead_method: 'lead_ad_landing',
      page_url: window.location.href,
      click_url: window.location.href,
      provider: 'google_ads',
      locale: document.documentElement ? document.documentElement.lang : null,
    }, attributionForDataLayer(attribution)));

    sendSignal(payload);
    markPaidLandingSeen(signature);
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
    } else if (href.indexOf('mailto:') === 0) {
      eventName = 'lead_click_email';
    } else if (href.indexOf('https://www.google.com/maps/dir/') === 0) {
      eventName = 'lead_click_directions';
      provider = 'google_maps';
    } else if (href.indexOf('https://maps.apple.com/') === 0) {
      eventName = 'lead_click_directions';
      provider = 'apple_maps';
    }

    if (!eventName) return;

    var attribution = getAttribution();
    var payload = {
      event: eventName,
      pageUrl: window.location.href,
      user: getUserId(),
      locale: document.documentElement ? document.documentElement.lang : null,
      clickUrl: href,
      provider: provider,
      attribution: attribution,
    };

    pushDataLayer(eventName, Object.assign({
      lead_method: eventName,
      page_url: window.location.href,
      click_url: href,
      provider: provider,
      locale: document.documentElement ? document.documentElement.lang : null,
    }, attributionForDataLayer(attribution)));

    sendSignal(payload);
  }

  handlePaidLanding();
  document.addEventListener('click', handleClick, { capture: true });
})();
