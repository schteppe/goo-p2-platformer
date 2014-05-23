define([
], function(
) {
	function checkBrowser() {
		// Make sure user is running Chrome/Firefox and that a WebGL context works.
		var isOpera = !!window.opera || navigator.userAgent.indexOf(' OPR/') >= 0;
		var isFirefox = typeof InstallTrigger !== 'undefined';
		var isSafari = Object.prototype.toString.call(window.HTMLElement).indexOf('Constructor') > 0;
		var isChrome = !!window.chrome && !isOpera;
		var isIE = false || document.documentMode;
		var isCocoonJS = navigator.appName === "Ludei CocoonJS";

		if (!(isFirefox || isChrome || isSafari || isCocoonJS || isIE === 11)) {
			alert("Sorry, but your browser is not supported.\nGoo works best in Google Chrome or Mozilla Firefox.\nYou will be redirected to a download page.");
			window.location.href = 'https://www.google.com/chrome';
		} else if (!window.WebGLRenderingContext) {
			alert("Sorry, but we could not find a WebGL rendering context.\nYou will be redirected to a troubleshooting page.");
			window.location.href = 'http://get.webgl.org/troubleshooting';
		} else if (disabledWebGL() === true) {
			alert('You seem to have WebGL disabled, redirecting to a helpful page.');
			window.location.href = 'http://app.goocreate.com/webgl-disabled';
		}
	}
	
	function disabledWebGL() {
		var gl = null;
		var canvas = document.createElement('canvas');
		var e;

		try {
			gl = canvas.getContext('webgl');
		}
		catch (_error) {
			e = _error;
			gl = null;
		}

		if (gl === null) {
			try {
				gl = canvas.getContext('experimental-webgl');
			}
			catch (_error) {
				e = _error;
				gl = null;
			}
		}

		if (gl === null && window.WebGLRenderingContext) {
			return true;
		} else {
			return false;
		}
	};
	
	return checkBrowser;
});