/* Coordinate maths for the Bandurrias app.
 *   metres  : east/north of the map origin (overview frame, same as the Python side)
 *   latlng  : Leaflet CRS.Simple [lat, lng] at the max native zoom `zmax` (lat = -y_px / 2^zmax, lng = x_px / 2^zmax)
 *   lonlat  : GPS degrees; converted with the equirectangular projection overview.py uses (lon0, lat0, KX, KY from meta.json)
 */
(function (root) {
  function make(meta) {
    var s = Math.pow(2, meta.zmax), pxm = meta.px_per_m, P = meta.proj;
    return {
      m2ll: function (x, y) { return [-(meta.y1 - y) * pxm / s, (x - meta.x0) * pxm / s]; },
      ll2m: function (lat, lng) { return [lng * s / pxm + meta.x0, meta.y1 + lat * s / pxm]; },
      lonlat2m: function (lon, lat) { return [(lon - P.lon0) * P.KX, (lat - P.lat0) * P.KY]; },
      m2lonlat: function (x, y) { return [x / P.KX + P.lon0, y / P.KY + P.lat0]; },
      mToUnits: function (m) { return m * pxm / s; },                       // metres -> latlng units (for circle radii)
      bounds: function () { return [[-meta.height_px / s, 0], [0, meta.width_px / s]]; },
      inside: function (x, y, tol) { tol = tol || 0; return x >= meta.x0 - tol && x <= meta.x1 + tol && y >= meta.y0 - tol && y <= meta.y1 + tol; }      // tol: metres of slack
    };
  }
  var Geo = { make: make };
  if (typeof module !== 'undefined' && module.exports) module.exports = Geo; else root.Geo = Geo;
})(this);
