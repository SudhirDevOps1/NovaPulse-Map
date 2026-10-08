/*!
 * NovaPulse Edge Map — probe simulator
 * ---------------------------------------------------------------------------
 * A drop-in stand-in for a real telemetry endpoint. Returns exactly the shape
 * the library expects, so the examples work identically whether they are
 * talking to a real API or to this.
 *
 * Why it exists: the showcase has to work on GitHub Pages, in CI, and from a
 * plain file:// with no server anywhere. An example that only renders against
 * a local endpoint is a broken example the moment anyone else opens it.
 *
 * The examples try the real API first and fall back to this, labelling which
 * one they are showing.
 *
 * Usage:
 *   const sim = new ProbeSim();
 *   sim.nodes();            // -> [{ id, name, ..., latency }]
 *   sim.set('outage', true); // force a regional failure
 *   sim.reset();
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ProbeSim = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var FLEET = [
    { id:'iad', name:'Ashburn',      region:'us-east',    country:'US', lat:  39.0438, lon:  -77.4874, base: 12 },
    { id:'ewr', name:'New York',     region:'us-east',    country:'US', lat:  40.7128, lon:  -74.0060, base: 18 },
    { id:'ord', name:'Chicago',      region:'us-central', country:'US', lat:  41.8781, lon:  -87.6298, base: 24 },
    { id:'dfw', name:'Dallas',       region:'us-central', country:'US', lat:  32.7767, lon:  -96.7970, base: 31 },
    { id:'sjc', name:'San Jose',     region:'us-west',    country:'US', lat:  37.3541, lon: -121.9552, base: 42 },
    { id:'lhr', name:'London',       region:'eu-west',    country:'GB', lat:  51.5074, lon:   -0.1278, base: 78 },
    { id:'fra', name:'Frankfurt',    region:'eu-central', country:'DE', lat:  50.1109, lon:    8.6821, base: 84 },
    { id:'ams', name:'Amsterdam',    region:'eu-west',    country:'NL', lat:  52.3676, lon:    4.9041, base: 86 },
    { id:'dxb', name:'Dubai',        region:'me',         country:'AE', lat:  25.2048, lon:   55.2708, base:121 },
    { id:'bom', name:'Mumbai',       region:'apac',       country:'IN', lat:  19.0760, lon:   72.8777, base:148 },
    { id:'gru', name:'Sao Paulo',    region:'sa',         country:'BR', lat: -23.5505, lon:  -46.6333, base:156 },
    { id:'sin', name:'Singapore',    region:'apac',       country:'SG', lat:   1.3521, lon:  103.8198, base:186 },
    { id:'nrt', name:'Tokyo',        region:'apac',       country:'JP', lat:  35.6762, lon:  139.6503, base:204 },
    { id:'syd', name:'Sydney',       region:'apac',       country:'AU', lat: -33.8688, lon:  151.2093, base:238 },
    { id:'jnb', name:'Johannesburg', region:'africa',     country:'ZA', lat: -26.2041, lon:   28.0473, base:169 },
    { id:'yyz', name:'Toronto',      region:'us-east',    country:'CA', lat:  43.6532, lon:  -79.3832, base: 27 }
  ];

  function ProbeSim(options) {
    var o = options || {};
    this.flags = { outage: !!o.outage, jitter: !!o.jitter };
    this._status = {};
    var self = this;

    FLEET.forEach(function (n) { self._status[n.id] = 'Operational'; });

    /* One permanently degraded node so the degraded style is visible on
       first paint — a status page that only ever shows green teaches nothing
       about what a problem looks like. */
    this._status.bom = 'Degraded';
  }

  /* Deterministic subset by id, so repeated polls affect a stable set of
     nodes rather than a different random set each time. */
  function bucket(id, mod) {
    var h = 0;
    for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return h % mod;
  }

  ProbeSim.prototype.set = function (key, on) {
    this.flags[key] = !!on;
    if (key === 'outage' && !on) {
      /* Clearing the outage restores everything, which is what makes the
         recovery event observable in one click. */
      var self = this;
      Object.keys(this._status).forEach(function (id) {
        if (self._status[id] !== 'Down' && self._status[id] !== 'Degraded') return;
        self._status[id] = 'Operational';
      });
      this._status.bom = 'Degraded';
    }
    return this;
  };

  ProbeSim.prototype.forceDown = function (id) {
    if (id in this._status) this._status[id] = 'Down';
    return this;
  };

  ProbeSim.prototype.nodes = function () {
    var self = this;
    var spread = this.flags.jitter ? 0.48 : 0.24;

    return FLEET.map(function (n) {
      var status = self._status[n.id];

      /* A forced outage takes out a stable third of the fleet and degrades
         another fifth — the shape a real regional failure produces. */
      if (self.flags.outage) {
        if (bucket(n.id, 3) === 0) status = 'Down';
        else if (bucket(n.id, 5) === 0) status = 'Degraded';
      }

      var jitter = Math.round(n.base * (Math.random() * spread - spread / 2));

      return {
        id: n.id,
        name: n.name,
        region: n.region,
        country: n.country,
        lat: n.lat,
        lon: n.lon,
        status: status,
        latency: status === 'Down' ? 0 : Math.max(1, n.base + jitter),
        uptime: status === 'Down' ? 97.4 + Math.random()
               : status === 'Degraded' ? 99.2 + Math.random() * 0.4
               : 99.9 + Math.random() * 0.09,
        note: status === 'Down' ? 'Probe timeout - no response in 30s' : ''
      };
    });
  };

  ProbeSim.prototype.fail = function (ids) {
    var self = this;
    (ids || []).forEach(function (id) { self.forceDown(id); });
    return this;
  };

  ProbeSim.prototype.reset = function () {
    var self = this;
    FLEET.forEach(function (n) { self._status[n.id] = 'Operational'; });
    this._status.bom = 'Degraded';
    this.flags.outage = this.flags.jitter = false;
    return this;
  };

  ProbeSim.FLEET = FLEET;
  return ProbeSim;
});