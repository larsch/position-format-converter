$(function(){
    var marker;
    var initPos = [ 17.39258, 18.10547 ];
    var map;
    var mapCanvas = $("#map-canvas");
    var separator = "\\s*,?\\s*";
    var decimal = "(?:(?:\\d+(?:\\.\\d*)?)|(?:\\.\\d+))";
    var signedDecimal = "[+-]?" + decimal;

    function signIndex(num) {
	return num >= 0.0 ? 0 : 1;
    }
    function roundFloat(num, trailing) {
	var f = Math.pow(10.0, trailing);
	return Math.round(num * f) / f;
    }
    function degMin(num, trailing) {
	var deg = Math.floor(num);
	var six = roundFloat(60.0 * (num % 1.0), trailing);
	if (six >= 60.0)
	    return [ deg + 1.0, 0.0 ];
	else
	    return [ deg, six ];
    }
    function degMinSec(num, trailing) {
	var deg = Math.floor(num);
	var min = Math.floor(60.0 * (num % 1.0));
	var sec = roundFloat(num - deg - min / 60.0, trailing);
	if (sec >= 60.0) { sec = 0.0; min += 1.0; }
	if (min >= 60.0) { min = 0.0; deg += 1.0; }
	return [deg, min, sec];
    }
    function signFactor(letter) {
	return (letter == "N" || letter == "E") ? 1.0 : -1.0;
    }
    function zeroFill(num, length) {
	var str = num.toString();
	while (str.length < length)
	    str = "0" + str;
	return str;
    }
    function formatFloat(num, trailing) {
	var factor = Math.pow(10.0, trailing);
	var interm = Math.floor(num * factor) / factor;
	var res = interm.toString();
	return (res.indexOf(".") == -1) ? res + ".0" : res;
    }
    function zeroFillFloat(num, leading, trailing) {
	return zeroFill(Math.floor(num), leading) + formatFloat(num % 1.0, trailing).substr(1);
    }
    var formats = {
	signedDecimal: {
	    parse: function(text) {
		var regexp = new RegExp("^(" + signedDecimal + ")" + separator + "(" + signedDecimal + ")$");
		var m;
		if (m = text.match(regexp)) {
		    return [parseFloat(m[1]), parseFloat(m[2])];
		} else
		    return null;
	    },
	    format: function(pos) {
		return formatFloat(pos[0], 7) + ", " + formatFloat(pos[1], 7);
	    }
	},
	degreesDecimalMinutes: {
	    parse: function(text) {
		var degDecMin = "(\\d+)\\s*\u00B0\\s*("+decimal+")"
		var regexp = new RegExp("^" + degDecMin + "\\s*'?\\s*([NS])" + separator + degDecMin + "\\s*'?\\s*([EW])$", "i");
		var m;
		if (m = text.match(regexp)) {
		    return [ signFactor(m[3]) * (parseInt(m[1]) + parseFloat(m[2]) / 60.0),
			     signFactor(m[6]) * (parseInt(m[4]) + parseFloat(m[5]) / 60.0) ];
		}
	    },
	    format : function(pos) {
		var sense1 = ["N","S"][signIndex(pos[0])];
		var sense2 = ["E","W"][signIndex(pos[1])];
		var degMin1 = degMin(Math.abs(pos[0]), 5);
		var degMin2 = degMin(Math.abs(pos[1]), 5);
		return "" + degMin1[0] + "\u00B0 " + formatFloat(degMin1[1], 5) + "' " + sense1 + " " + degMin2[0] + "\u00B0 " + formatFloat(degMin2[1], 5) + "' " + sense2;
	    }
	},
	degreesMinutesSeconds: {
	    parse: function(text) {
		var degMinSec = "(\\d+)\\s*\u00B0\\s*(\\d+)\\s*'\\s*(" + decimal + ")\\s*\"";
		var regexp = new RegExp("^" + degMinSec + "\\s*([NS])" + separator + degMinSec + "\\s*([EW])$", "i");
		var m;
		if (m = text.match(regexp))
		    return [ signFactor(m[4]) * (parseInt(m[1]) + (parseInt(m[2]) + parseFloat(m[3]) / 60.0) / 60.0),
			     signFactor(m[8]) * (parseInt(m[5]) + (parseInt(m[6]) + parseFloat(m[7]) / 60.0) / 60.0) ];
	    },
	    format: function(pos) {
		var sense1 = ["N","S"][signIndex(pos[0])];
		var sense2 = ["E","W"][signIndex(pos[1])];
		var dms1 = degMinSec(Math.abs(pos[0]), 3);
		var dms2 = degMinSec(Math.abs(pos[1]), 3);
		return "" + dms1[0] + "\u00B0 " + dms1[1] + "' " + dms1[2].toFixed(3) + '" ' + sense1 + " " +
		    dms2[0] + "\u00B0 " + dms2[1] + "' " + dms2[2].toFixed(3) + '" ' + sense2;
	    }
	},
	gpgga: {
	    parse: function(text) {
		var regexp = new RegExp("^\\$GPGGA,\\d{6}(?:\\.\\d+)?,(\\d{2})(\\d\\d\\.\\d+),([NS]),(\\d{3})(\\d\\d\\.\\d+),([EW]),.*");
		var m;
		if (m = text.match(regexp)) {
		    return [ signFactor(m[3]) * (parseInt(m[1]) + parseFloat(m[2]) / 60.0),
			     signFactor(m[6]) * (parseInt(m[4]) + parseFloat(m[5]) / 60.0) ];
		}
	    },
	    format: function(pos) {
		var sense1 = ["N","S"][signIndex(pos[0])];
		var sense2 = ["E","W"][signIndex(pos[1])];
		var degMin1 = degMin(Math.abs(pos[0]), 4);
		var degMin2 = degMin(Math.abs(pos[1]), 4);
		return "$GPGGA,000000.000," + zeroFill(degMin1[0], 2) + zeroFillFloat(degMin1[1], 2, 4) + "," + sense1 + "," + zeroFill(degMin2[0], 3) + zeroFillFloat(degMin2[1], 2, 4) + "," + sense2 + ",...";
	    }
	}
    };

    function parsePos(text, format) {
	var pos;
	if (pos = formats[format].parse(text.trim()))
	    if (pos[0] >= -90.0 && pos[0] <= 90.0 && pos[1] >= -180.0 && pos[1] <= 180.0)
		return pos;
	return null;
    }

    function setPosition(position, thisFormat) {
	var otherFormat;
	for (otherFormat in formats)
	    if (otherFormat != thisFormat) {
		var val = formats[otherFormat].format(position);
		var elem = $("#" + otherFormat);
		elem.val(val);
		elem[0].old_val = val;
	    }
	$("input").removeClass("has-error");
    }
    function update(elem) {
	var thisFormat = elem[0].id;
	var pos;
	if (elem.val() == elem[0].old_val) return;
	elem[0].old_val = elem.val();
	if (pos = parsePos(elem.val(), thisFormat)) {
	    elem.parent().removeClass("has-error");
	    setPosition(pos, thisFormat);
	    if (map) map.setCenter({lat: pos[0], lng: pos[1]});
	    if (marker) marker.setPosition({lat: pos[0], lng: pos[1]});
	} else {
	    elem.parent().addClass("has-error");
	}
    }
    $(".position").on('change keyup paste', function() { update($(this)); } );
    var mapOptions = { zoom: 4, center: { lat: initPos[0], lng: initPos[1] } };
    map = new google.maps.Map(mapCanvas[0], mapOptions);
    marker = new google.maps.Marker({position: { lat: initPos[0], lng: initPos[1] }, map: map });
    setPosition(initPos, "map")
    google.maps.event.addListener(map, 'click', function(e){
	setPosition([e.latLng.lat(), e.latLng.lng()], "map");
	marker.setPosition(e.latLng);
    });

    function resizeMap() {
	var offset = mapCanvas.offset();
	var remaining = parseInt($(window).height() - offset.top - 20);
	mapCanvas.height(Math.max(remaining, 128));
    };
    $(window).resize(resizeMap);
    resizeMap();
});
