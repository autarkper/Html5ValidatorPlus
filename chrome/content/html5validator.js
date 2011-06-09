/* namespacing technique adapted from http://blogger.ziesemer.com/2007/10/respecting-javascript-global-namespace.html */
if (!window.four56bereastreet) {var four56bereastreet = {};}

four56bereastreet.html5validator = (function()
{
	if (four56bereastreet.html5validator)
	{
		return four56bereastreet.html5validator;
	}
	var myName = "HTML5 Validator Plus";
	var Application = Components.classes["@mozilla.org/fuel/application;1"].getService(Components.interfaces.fuelIApplication);
	var pbs = Components.classes["@mozilla.org/privatebrowsing;1"].getService(Components.interfaces.nsIPrivateBrowsingService);
	function normalizeUrl(url)
	{
		return url.replace(/#.*/, '');
	};
	var preferences = {},
		preferenceToken, // a concatenated string of all result-affecting preference values
		loadPreferences = function()
		{
			var prefBranch = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService).getBranch("extensions.html5validator."),
				whitelist = prefBranch.getCharPref("domainsWhitelist"),
				domains = (whitelist.length ? whitelist.split('\n') : []),
				filtered_domains = [];

			// fix domains, accepts: domain OR http://domain OR https://domain
			for (var i = 0; i < domains.length; i++)
			{
				domains[i] = domains[i].replace(/(https?:\/\/)?(www\.)?([^\s\/]+)\/?/i, function(r, r1, r2, r3){
					return (r1.length ? r1.toLowerCase() : 'http://') + r3.toLowerCase() + '/';
				});
				domains[i] = domains[i].replace(/\s+/g, '');
				if (domains[i].length) {filtered_domains.push(domains[i]);}
			}

			preferences = {
				validatorURL: prefBranch.getCharPref("validatorURL"),
				domainsWhitelist: filtered_domains,
				restrictToWhitelist: prefBranch.getBoolPref("restrictToWhitelist"),
				displayResultsInTab: prefBranch.getBoolPref("displayResultsInTab"),
				displayIconInLocationBar: prefBranch.getBoolPref("displayIconInLocationBar"),
				maxAutoSize: prefBranch.getIntPref("maxAutoSize"),
				autoValidateWaitSeconds: prefBranch.getIntPref("autoValidateWaitSeconds"),
				useTrigger: prefBranch.getBoolPref("useTrigger"),
				debug: prefBranch.getBoolPref("debug"),
				ignoreXHTMLErrors: prefBranch.getBoolPref("ignoreXHTMLErrors"),
				allowAccessibilityFeatures: prefBranch.getBoolPref("allowAccessibilityFeatures"),
				parser: prefBranch.getCharPref("parser")
			};
			preferenceToken = [ // remember to update this as new result-affecting preferences are added!
				preferences.parser,
				preferences.ignoreXHTMLErrors,
				preferences.allowAccessibilityFeatures
			].join(";");
			log("Preference Token: " + preferenceToken);
			locationBarIcon.hidden = !preferences.displayIconInLocationBar;
		},
		// observe preferences changes
		preferencesObserver =
		{
			register: function()
			{
				var prefService = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService);
				this._branch = prefService.getBranch("extensions.html5validator.");
				this._branch.QueryInterface(Components.interfaces.nsIPrefBranch2);
				this._branch.addObserver("", this, false);
			},
			observe: function(aSubject, aTopic, aData)
			{
				if (aTopic != "nsPref:changed") {
					return;
				}

				loadPreferences();
				validateDocHTML(false);
			}
		},

		console = Components.classes["@mozilla.org/consoleservice;1"].getService(Components.interfaces.nsIConsoleService),
		log = (function()
		{
			if (!console) {return (function(msg){});} // dummy
			// use central storage to achieve consistent numbering across window instances:
			var logFn = Application.storage.get("logFn", null);
			if (!logFn) {
				var msgNo = 0;
				logFn = function(msg) {
					++msgNo;
					console.logStringMessage(myName + ': (' + msgNo + ") " + msg);
				}
				Application.storage.set("logFn", logFn);
			}
			return logFn;
		}());

	var html5validatorListener = 
	{
		QueryInterface: function(aIID)
		{
			if (aIID.equals(Components.interfaces.nsIWebProgressListener) || 
				aIID.equals(Components.interfaces.nsISupportsWeakReference) || 
				aIID.equals(Components.interfaces.nsISupports)) {
				return this;
			}
			throw Components.results.NS_NOINTERFACE;
		},

		onLocationChange: function(aProgress, aRequest, aURI)
		{
			var doc = getActiveDocument();
			updateStatusBar(0, 0, "reset");
			if (doc && isValidUrl(doc.URL))
			{
				doc.html5ValidatorNormalizedURL = normalizeUrl(doc.URL);
				log("LocChange: " + doc.html5ValidatorNormalizedURL);
				validateDocHTML(false);
			}
		},

		lastStartURL: null,
		onStateChange: function(aWebProgress, aRequest, aStateFlags, aStatus)
		{
		/* See: https://developer.mozilla.org/en/XUL_School/Intercepting_Page_Loads */
			if (aStateFlags & Components.interfaces.nsIWebProgressListener.STATE_IS_WINDOW)
			{
				if (aStateFlags & Components.interfaces.nsIWebProgressListener.STATE_RESTORING) {
				/*
				 * Unfortunately, this flag is not reliable: it is not set when going back more than three pages
				 * in the page history.
				*/
					return;
				}
				if (window === window.top) {
				/* It seems that on reload (F5) we get a STATE_START and a STATE_STOP on
					* the same location. If it is a case of going back and forth in the page history,
					* we get a STATE_START on the old location, and then STATE_STOP on the
					* new location.
					* We can use this heuristic to avoid invalidating our cache expect when there is
					* a genuine reload.
					* Tested in FF 5.02a.
				*/
					var doc = getActiveDocument();
					if (!doc.URL || !isValidUrl(doc.URL)) {
						return;
					}
					doc.html5ValidatorNormalizedURL = normalizeUrl(doc.URL);
					if (aStateFlags & Components.interfaces.nsIWebProgressListener.STATE_START) {
						log("State START: " + doc.URL);
						this.lastStartURL = doc.html5ValidatorNormalizedURL;
					}
					if (aStateFlags & Components.interfaces.nsIWebProgressListener.STATE_STOP) {
						log("State STOP: " + doc.URL + ", aStatus: " + aStatus);
						if (doc.html5ValidatorNormalizedURL == this.lastStartURL)
						{
							log("Invalidate results cache: " + doc.URL);
							vCache.invalidate(doc);
						}
						this.lastStartURL = null;
						if (aStatus) { // error
							updateStatusBar(0,0, 'reload-document');
							doc.html5ValidatorLastStatus = aStatus;
						}
						// attempt validation anyway, in case the main document was downloaded OK
						validateDocHTML(false);
					}
				}
			}
		},
		onProgressChange: function(aWebProgress, aRequest, curSelf, maxSelf, curTot, maxTot){},
		onStatusChange: function(aWebProgress, aRequest, aStatus, aMessage){},
		onSecurityChange: function(aWebProgress, aRequest, aState){}
	};

	var toolbarButton, locationBarIcon,

	parserString = function(prefs)
	{
		// only write out the parser string if not inferred
		return prefs.parser.length ? " [parser:" + prefs.parser  + "]" : "";
	},

	isValidUrl = function(url)
	{
		return url && url.match(/^https?:\/\//);
	},
	
	isWhitelistDomain = function(url)
	{
		if (!isValidUrl(url)) {
			return false;
		}

		// if no domains whitelisted, then validate all URLs
		if (!preferences.domainsWhitelist.length) {
			return preferences.useTrigger; // but only if auto-validation is not in effect
		}
		for (var i = 0; i < preferences.domainsWhitelist.length; i++)
		{
			var d = preferences.domainsWhitelist[i];
			if (d.indexOf('*') >= 0) {
				// d contains a wildcard, so change it to a regexp
				d = new RegExp(d.replace(/[-[\]{}()+?.,\\^$|]/g, "\\$&"). // escape other reserved characters
					replace(/\*+/g, '(.*?)')
				);
				try // in case some funny character creeps through...
				{
					if (url.match(d)) {
						return true;
					}
				}
				catch (err) {
					log(err);
				}
			} else if (d == url.replace('://www.', '://').substr(0, d.length)) {
				return true;
			}
		}

		return false;
	},


	vCache = (function()
	{
		var resCache = {};
		var navCache = {};
		var busyCache = {};

		var pub = Application.storage.get("vCache", null);
		if (!pub)
		{
			pub = {
				lookupResults: function(doc)
				{
					var url = doc.html5ValidatorNormalizedURL;
					var results = resCache[url];
					if (!results) {
						return null;
					}
					return results[preferenceToken] || null;
				},
				storeResults: function(doc, result)
				{
					var url = doc.html5ValidatorNormalizedURL;
					delete busyCache[url];
					var results = resCache[url] || (resCache[url] = {});
					results[preferenceToken] = result;
				},
				invalidate: function(doc)
				{
					var url = doc.html5ValidatorNormalizedURL;
					delete resCache[url];
				},
				setBusyState: function(doc, busy)
				{
					var url = doc.html5ValidatorNormalizedURL;
					if (busy) {
						busyCache[url] = true;
					}
					else {
						delete busyCache[url];
					}
				},
				isBusy: function(doc)
				{
					var url = doc.html5ValidatorNormalizedURL;
					return busyCache[url] || false;
				},
				lookupNoAutoValidation: function(doc)
				{
					var url = doc.html5ValidatorNormalizedURL;
					return navCache[url] || false;
				},
				storeNoAutoValidation: function(doc)
				{
					var url = doc.html5ValidatorNormalizedURL;
					navCache[url] = true;
				}
			};
			Application.storage.set("vCache", pub);
		}
		return pub;
	}()),

	g_cleanup = null,
	g_validationTimerHandle = null,
	validateDocHTML = function(triggered, optTimeoutMs)
	{
		var timeoutMs = optTimeoutMs || 100;
		if (g_cleanup) {g_cleanup();}
		if (g_validationTimerHandle) {
			window.clearTimeout(g_validationTimerHandle);
		}
		g_validationTimerHandle = window.setTimeout(function() {
			try {
				validateDocHTML__(triggered, timeoutMs);
			}
			catch (err)
			{
				log(err);
				updateStatusBar(0, 0, 'internalError');
			}
		}, timeoutMs); // avoid calling validateDocHTML__ repeatedly in case of rapid state changes
	},

	// Adapted from the "HTML Validator" extension by Marc Gueury (http://users.skynet.be/mgueury/mozilla/)
	validateDocHTML__ = function(triggered, optTimeoutMs)
	{
		var doc = getActiveDocument();
		if (!doc || !doc.html5ValidatorNormalizedURL) {
			return;
		}
		if (isLoading(doc))
		{
			updateStatusBar(0, 0, 'document-loading');
			validateDocHTML(triggered, optTimeoutMs * 2); // come back later
			return;
		}

		if (vCache.isBusy(doc))
		{
			updateStatusBar(0, 0, "running");
			return;
		}

		var url = doc.html5ValidatorNormalizedURL;
		var html;
		if (triggered)
		{
			html = getHTMLFromCache(doc, triggered);
			if (html && html.length) {
				validateDoc(doc, html);
			}
			else {
				updateStatusBar(0, 0, 'reload-document');
			}
			return;
		}
		var cache = vCache.lookupResults(doc);
		if (cache)
		{
			updateStatusBar(cache['errors'], cache['warnings'], 'results');
			return;
		}
		var isAutoDomain = isWhitelistDomain(url);
		if (isAutoDomain) 
		{
			if (preferences.useTrigger)
			{
				updateStatusBar(0, 0, 'use-trigger');
				return;
			}
			if (pbs && pbs.privateBrowsingEnabled)
			{
				updateStatusBar(0, 0, 'private-browsing-use-trigger');
				return;
			}
			if (vCache.lookupNoAutoValidation(doc))
			{
				updateStatusBar(0, 0, 'cancelled');
				return;
			}
			// do not attempt auto-validation unless we have a visible UI
			function isInvisibleUI()
			{
				// locationBarIcon doesn't count here, as it doesn't have a label
				return ((toolbarButton.parentNode.collapsed) || (toolbarButton.parentNode.hidden));
			}
			if (isInvisibleUI()) {
				log("ui collapsed or hidden");
				updateStatusBar(0, 0, 'cancelled'); // display a sensible message later when made visible
				return;
			}
			html = html || getHTMLFromCache(doc, triggered);
			if (!html || !html.length) {
				updateStatusBar(0, 0, 'reload-document');
				return;
			} // the cache seems to have been cleared

			var isSmallish =
                preferences.maxAutoSize < 0 // unlimited
                ||(html.length < (preferences.maxAutoSize) * 1024);
			if (isSmallish)
			{
				updateStatusBar(0, 0, 'about-to-validate');
				var timeoutHandle = null, removeEscapeListener;
				function stopTimeout()
				{
					if (timeoutHandle) {window.clearTimeout(timeoutHandle); timeoutHandle = null;} // cancel pending validation
				}
				function cancelOnEscape(event)
				{
					if (event.keyCode === event.DOM_VK_ESCAPE)
					{
						if (g_cleanup) {g_cleanup();}
						vCache.storeNoAutoValidation(doc);
						updateStatusBar(0, 0, 'cancelled');
					}
				}
				removeEscapeListener = function(){doc.removeEventListener('keydown', cancelOnEscape, false);};

				doc.addEventListener('keydown', cancelOnEscape, false);
				timeoutHandle = window.setTimeout(function() // do not flood server, use a cancellable timeout
				{
					if (g_cleanup) {g_cleanup();}
					if (isInvisibleUI()) {
						updateStatusBar(0, 0, 'cancelled');
						return;
					}
					validateDoc(doc, html);
				}, Math.max.apply(Math.max, [500, preferences.autoValidateWaitSeconds * 1000]));
				g_cleanup = function() {stopTimeout(); removeEscapeListener(); g_cleanup = null;};
				return;
			}
			else
			{
				updateStatusBar(0, 0, 'large-doc');
				return;
			}
		}
		else
		{
			updateStatusBar(0, 0, preferences.restrictToWhitelist ? 'restricted' : 'manual');
			return;
		}
	},
	
	getActiveDocument = function()
	{
		return window.content ? window.content.document : null;
	},

	isLoading = function(doc)
	{
		return !doc.html5ValidatorLastStatus && doc.readyState === "loading";
	},

	// Adapted from the "HTML Validator" extension by Marc Gueury (http://users.skynet.be/mgueury/mozilla/)
	getHTMLFromCache = function(doc, triggered, force)
	{	 
		if (isLoading(doc)) {
			log("getHTMLFromCache: is loading");
			return null;
		}

		// Part 1 : get the history entry (nsISHEntry) associated with the document
		var webNav = null;

		var win = doc.defaultView;
		if (win == window) {
			log("win == window");
			win = window.content;
		}

		var ifRequestor = win.QueryInterface(Components.interfaces.nsIInterfaceRequestor);
		webNav = ifRequestor.getInterface(Components.interfaces.nsIWebNavigation);

		// Get the 'PageDescriptor' for the current document. This allows the
		// to access the cached copy of the content rather than refetching it from
		// the network...
		var PageLoader = webNav.QueryInterface(Components.interfaces.nsIWebPageDescriptor),
			PageCookie = PageLoader.currentDescriptor,
			shEntry = PageCookie.QueryInterface(Components.interfaces.nsISHEntry);

		// Part 2 : open a nsIChannel to get the HTML of the doc
		var url = doc.html5ValidatorNormalizedURL;
		var urlCharset = doc.characterSet;

		var ios = Components.classes["@mozilla.org/network/io-service;1"].getService(Components.interfaces.nsIIOService);
		var channel = ios.newChannel(url, urlCharset, null);
		channel.loadFlags |= Components.interfaces.nsIRequest.VALIDATE_NEVER;
		channel.loadFlags |= Components.interfaces.nsIRequest.LOAD_FROM_CACHE;
		if (!force)
		{
			channel.loadFlags |= Components.interfaces.nsICachingChannel.LOAD_ONLY_FROM_CACHE;
		}

		// Use the cache key to distinguish POST entries in the cache (see nsDocShell.cpp)
		var cacheChannel = channel.QueryInterface(Components.interfaces.nsICachingChannel);
		cacheChannel.cacheKey = shEntry.cacheKey;

		var s = '';
		var stream = channel.open();
		try {
			const replacementChar = Components.interfaces.nsIConverterInputStream.DEFAULT_REPLACEMENT_CHARACTER;
			var is = Components.classes["@mozilla.org/intl/converter-input-stream;1"].
							createInstance(Components.interfaces.nsIConverterInputStream);
			is.init(stream, urlCharset, 1024, replacementChar);
			try {
				var str = {};
				while (is.readString(4096, str)) {
					s += str.value;
				}
			}
			finally {
				is.close();
			}
		}
		finally {
			stream.close();
		}
		
		if (s.length === 0)
		{
			log("html length 0");
			if (triggered && !force)
			{
				updateStatusBar(0, 0, "fetching");
				return getHTMLFromCache(doc, triggered, true);
			}
		}

		return s;
	},

	g_usbTimeoutHandle = null,
	updateStatusBar = function(errors, warnings, status)
	{
		if (g_usbTimeoutHandle) {window.clearTimeout(g_usbTimeoutHandle);}
		g_usbTimeoutHandle = window.setTimeout( function() {
			updateStatusBar__(errors, warnings, status);
		}, 50); // prevent flickering in case of user flipping through tabs, etc.
	},

	g_clickEnabled = true,
	updateIcon = function(data)
	{
		if (data.src) {locationBarIcon.src = toolbarButton.src = data.src;}
		if (data.tooltipText) {locationBarIcon.tooltipText = toolbarButton.tooltipText = data.tooltipText;}
	},
	formatErrorAndWarningString = function(errors, warnings, forceOutput)
	{
		var errorText = "";
		if (errors || forceOutput) {
			errorText += errors + " error";
			if (errors !== 1) {
				errorText += "s";
			}
		}
		if ((errors && warnings) || forceOutput) {
			errorText += " and ";
		}
		if (warnings || forceOutput) {
			errorText += warnings + " warning";
			if (warnings !== 1) {
				errorText += "s";
			}
		}
		return errorText;
	},
	updateStatusBar__ = function(errors, warnings, status)
	{
		log("updateStatusBar: " + status);
		if (errors || warnings) {
			var errorText = formatErrorAndWarningString(errors, warnings);
			toolbarButton.label = errorText;
			updateIcon({src: "chrome://html5validator/skin/html5-error-red.png"});
			toolbarButton.className = "statusbarpanel-iconic-text errors";
			updateIcon({tooltipText: myName + parserString(preferences) + ": Click to view validation details"});
			g_clickEnabled = true;
		}
		else
		{
			g_clickEnabled = true;
			updateIcon({src: "chrome://html5validator/skin/html5-dimmed.png"});
			toolbarButton.className = "statusbarpanel-iconic-text";
			toolbarButton.label = "Click to validate";
			switch (status) {
				case "reload-document":
					toolbarButton.label = "Not in cache";
					updateIcon({tooltipText: myName + ": Document not in cache, click to fetch and validate"});
					break;
				case "document-loading":
					toolbarButton.label = "Document loading...";
					updateIcon({tooltipText: myName + ": Document is loading, please wait"});
					g_clickEnabled = false;
					break;
				case "running":
					toolbarButton.label = "Validating...";
					updateIcon({tooltipText: myName + ": Document currently validating"});
					g_clickEnabled = false;
					break;
				case "fetching":
					toolbarButton.label = "Fetching...";
					updateIcon({tooltipText: myName + ": Fetching document to validate"});
					g_clickEnabled = false;
					break;
				case "reset":
					toolbarButton.label = "";
					updateIcon({tooltipText: myName + ": Idle"});
					g_clickEnabled = false;
					break;
				case "use-trigger":
					updateIcon({tooltipText: myName + ": Auto-validation off, click to validate"});
					break;
				case "private-browsing-use-trigger":
					updateIcon({tooltipText: myName + ": Private browsing mode active, click to validate"});
					break;
				case "large-doc":
					updateIcon({tooltipText: myName + ": Document too large for auto-validation, click to validate"});
					break;
				case "cancelled":
					updateIcon({tooltipText: myName + ": Auto-validation cancelled, click to validate"});
					break;
				case "about-to-validate":
					updateIcon({tooltipText: myName + ": Validation pending..."});
					toolbarButton.label = "Validation pending, press Escape to cancel";
					break;
				case "manual":
					updateIcon({tooltipText: myName + ": Domain not in whitelist, click to validate"});
					break;
				case "restricted":
					toolbarButton.label = "Restricted";
					updateIcon({tooltipText: myName + ": Domain not in whitelist, validation restricted"});
					g_clickEnabled = false;
					break;
				case "errorValidator":
					toolbarButton.label = "Validator error";
					updateIcon({tooltipText: myName + ": Could not contact the validator, at '" + preferences.validatorURL + "'"});
					break;
				case "badResponse":
					toolbarButton.label = "Validator problem";
					updateIcon({tooltipText: myName + ": Bad response from validator, at '" + preferences.validatorURL + "'"});
					break;
				case "internalError":
					toolbarButton.label = "Internal Error";
					updateIcon({tooltipText: myName + ": Some internal error occurred"});
					break;
				case "results":
					updateIcon({src: "chrome://html5validator/skin/html5-ok.png"});
					toolbarButton.label = "";
					updateIcon({tooltipText: myName + "" + parserString(preferences) + ": No errors. Click to view validation details"});
					break;
				default:
					toolbarButton.label = "internal error";
					break;
			}
		}
	},

	validateDoc = function(doc, html)
	{
		if (html.length === 0) {return;}
		updateStatusBar(0, 0, "running");
		vCache.setBusyState(doc, true);

		var xhr = new XMLHttpRequest();
		function onload() {
			// Turn the returned string into a JSON object
			var response = (xhr.responseText.length ? JSON.parse(xhr.responseText) : false);
			if (!response) {
				// No valid JSON object returned
				throw "badResponse";
			}
			else {
				// Check how many errors and warnings were returned
				var messages = response.messages.length,
					message,
					errors = 0, warnings = 0;
				var filteredMessages = [];
				var suppressedMessages = [];
				for (var i = 0; i < messages; i++) {
					message = response.messages[i];
					if (message.type == "error")
					{
						if (preferences.ignoreXHTMLErrors) {
							// Do not count errors caused by an XHTML Doctype.
							// Not foolproof but matches XHTML 1.0 Strict/Transitional and 1.1 as long as no XML declaration is used.
							if ((message.message.match(/^Legacy doctype./i) && message.extract.match(/<!DOCTYPE html PUBLIC \"-\/\/W3C\/\/DTD XHTML 1.(1|0 Strict|0 Transitional)\/\/EN/i)) || message.message.match(/^Attribute “xml:lang” not allowed/i)) {
								suppressedMessages.push(message);
								continue;
							}
						}
						// upload is always utf-8, ignore spurious errors caused by this
						if (message.message.match(/Internal encoding declaration “.+?” disagrees with the actual encoding of the document/i)) {
							continue;
						}
						errors++;
						filteredMessages.push(message);
					}
					else if (message.type == "info") {
						if (message.subType == "warning") {
							if (preferences.allowAccessibilityFeatures) {
								// Do not count errors caused by removed accessibility features.
								// Currently allows the abbr, longdesc and scope attributes.
								if (message.message.match(/The “abbr” attribute on the “(td|th)” element is obsolete|The “longdesc” attribute on the “img” element is obsolete|The “scope” attribute on the “td” element is obsolete/i)) {
									suppressedMessages.push(message);
									continue;
								}
								// Currently allows the summary attribute.
								if (message.message.match(/The “summary” attribute is obsolete/i)) {
									suppressedMessages.push(message);
									continue;
								}
							}
							warnings++;
						}
						filteredMessages.push(message);
					}
				}
				var prefCopy = {};
				for (var key in preferences) {
					prefCopy[key] = preferences[key];
				}
				vCache.storeResults(doc, {
					"timestamp": new Date(),
					"preferences": prefCopy,
					"messages": filteredMessages,
					"suppressedMessages": suppressedMessages,
					"errors": errors,
					"warnings": warnings
				});
				if (doc === getActiveDocument()) // asynchronous, may have changed
				{
					updateStatusBar(errors, warnings, "results");
				}
			}
		};
		xhr.onload = function () {
			try {
				onload();
			}
			catch (err) {
				log(err);
				vCache.setBusyState(doc, false);
				updateStatusBar(0, 0, "badResponse");
			}
		};
		// If we couldn't validate the document (validator not running, network down, etc.)
		xhr.onerror = function(){
			vCache.setBusyState(doc, false);
			updateStatusBar(0, 0, "errorValidator");
		};

		// Send document to validator and tell it to return results in JSON format
		var parserOpt = preferences.parser.length ? "&parser=" + preferences.parser : '';
		xhr.open("POST", preferences.validatorURL + "?out=json" + parserOpt, true);
		xhr.setRequestHeader("Content-Type", "text/html;charset=UTF-8");
		xhr.send(html);
	},

	statusBarPanelClick = function()
	{
		var doc = getActiveDocument();
		if (!doc) {
			log("statusBarPanelClick: no document");
			showOptionsDialog();
			return;
		}

		// On first click there are no cached results - validate, on following clicks - show cached results
		if (vCache.lookupResults(doc)) {
			showValidationResults();
		}
		else if (g_clickEnabled) {
			validateDocHTML(true);
		}
		else {
			showOptionsDialog();
		}
	},

	getResultWindow = function() {
		return Application.storage.get("resultWindow", null);
	},
	setResultWindow = function(win) {
		Application.storage.set("resultWindow", win);
	},
	RESULTWINDOW = 'chrome://html5validator/content/resultswindow.html',
	showValidationResults = function()
	{
		var doc = getActiveDocument();
		var result = doc ? vCache.lookupResults(doc) : false;
		if (!result) {
			return;
		}

		var openInTab = preferences.displayResultsInTab;
		var resultWindow = null;
		var isNewWindow = true;
		if (openInTab || !getResultWindow() || getResultWindow().closed)
		{
			function openNewTab()
			{
				var newTab = getBrowser().loadOneTab(RESULTWINDOW, {relatedToCurrent:true, inBackground:false});
				var newbrowser = getBrowser().getBrowserForTab(newTab);
				return newbrowser.contentWindow;
			}
			function findOrOpenWindow() {
				setResultWindow(
					window.open(RESULTWINDOW, 'html5validator',
						"menubar=no,location=no,resizable=yes,minimizable=yes,scrollbars=yes,status=yes")
					);
				return getResultWindow();
			}
			resultWindow = openInTab ? openNewTab() : findOrOpenWindow();
		}
		else
		{
			isNewWindow = false;
			resultWindow = getResultWindow();
		}
		var timeoutMs = 25;
		var populateResultWindow = function()
		{
			var generatedDocument = resultWindow.document;
			var docBody = generatedDocument.getElementById('results');
			if (!docBody) {
				/* window.open returns before the new window is fully initialized, so we have to wait for it to
				initialize. "resultWindow.addEventListener('load', ...)" does not seem to work
				(possibly a race condition), so a simple timeout loop is used instead.
				*/
				log("results window state: " + generatedDocument.readyState);
				timeoutMs = timeoutMs * 2; // increasingly less aggressive timeout
				setTimeout(populateResultWindow, timeoutMs);
				return;
			}
			var resultsLookup = generatedDocument.resultsLookup || (generatedDocument.resultsLookup = {});
			var lastId = generatedDocument.lastId || 0;
			var lastSectionHeading = generatedDocument.lastSectionHeading || '';
			var resultId = result.timestamp.getTime();
			if (resultsLookup[resultId])
			{
				resultWindow.focus();
				resultWindow.location = RESULTWINDOW + "#" + resultsLookup[resultId];
				return;
			}

			var url = doc.html5ValidatorNormalizedURL;
			if (openInTab)
			{
				var titleElement = generatedDocument.getElementsByTagName('title')[0];
				if (titleElement)
				{
					titleElement.textContent = "[" + url + "] - Validation results";
				}
			}
			var sectionHeading = url + parserString(result.preferences);
			var errorsAndWarnings = formatErrorAndWarningString(result.errors, result.warnings, true);
			/* Create the HTML content of the body – a heading and the list of messages with some elements and class names to enable styling */

			var container = generatedDocument.createElement("DIV");
			container.id = 'section' + lastId;
			var linkList = container.appendChild(generatedDocument.createElement("UL"));
			linkList.className = "prevnext";
			var elNoResult = generatedDocument.getElementById('no-results');
			if (elNoResult) {
				// while this no longer has any visual effect, it is very
				// important since it serves to defuse the document's built-in time bomb!
				elNoResult.parentNode.removeChild(elNoResult);
			}
			else {
				docBody.insertBefore(generatedDocument.createElement("HR"), docBody.firstChild);

				var li = linkList.appendChild(generatedDocument.createElement("LI"));
				var fwdLink = li.appendChild(generatedDocument.createElement("A"));
				fwdLink.href = '#section' + (lastId - 1);
				fwdLink.textContent = "Next";
				fwdLink.title = lastSectionHeading;

				li = generatedDocument.linkList.appendChild(generatedDocument.createElement("LI"));
				var backLink = li.appendChild(generatedDocument.createElement("A"));
				backLink.href = "#" + container.id;
				backLink.textContent = "Previous";
				backLink.title = sectionHeading;
			}
			generatedDocument.linkList = linkList;

			generatedDocument.lastId = lastId + 1;
			var fragment = container.appendChild(generatedDocument.createElement("DIV"));
			var h2 = fragment.appendChild(generatedDocument.createElement('h2'));
			h2.innerHTML = sectionHeading;
			generatedDocument.lastSectionHeading = sectionHeading;
			var dateP = fragment.appendChild(generatedDocument.createElement('p'));
			dateP.textContent = "Display timestamp: " + (new Date()).toLocaleString();
			dateP = fragment.appendChild(generatedDocument.createElement('p'));
			dateP.textContent = "Validation timestamp: " + result.timestamp.toLocaleString();
			function displayPreference(key, value)
			{
				var p = fragment.appendChild(generatedDocument.createElement('p'));
				p.textContent = key + ": " + value;
			}
			displayPreference("Ignore XHTML Errors", result.preferences.ignoreXHTMLErrors);
			displayPreference("Allow Accessibility Features", result.preferences.allowAccessibilityFeatures);

			function generateErrorList(messages)
			{
				var errorList = generatedDocument.createElement('ol');
				var message, li, ext, st, len;
				for (var i = 0, l = messages.length; i < l; i++) {
					message = messages[i];
					li = errorList.appendChild(generatedDocument.createElement('li'));
					li.className = message['type'] + (message['subType'] ? ' ' + message['subType'] : '');
					li.innerHTML = '<p><strong class="type">' + (message['subType'] ? ' ' + message['subType'] : message['type']) + ':</strong> ' + encodeHTML(message['message']) + '</p>';
					if (message['lastLine']) {
						li.innerHTML += '<p class="location">At line <span class="last-line">' + message['lastLine'] + '</span>' + (message['firstColumn'] ? ', column <span class="first-col">' + message['firstColumn'] : '') + '</span></p>';
					}
					if (message['extract']) {
						ext = message['extract'];
						// If highlight positions are found, insert wrap the highlighted code
						if ((message['hiliteStart'] >= 0) && message['hiliteLength'])
						{
							st = message['hiliteStart'];
							len = message['hiliteLength'];
							ext = ext.substr(0, st) + '~^~' + ext.substr(st, len) + '~$~' + ext.substr(st + len);
							ext = encodeHTML(ext).replace('~^~', '<strong class="highlight">').replace('~$~', '</strong>');
						}
						else {
							ext = encodeHTML(ext);
						}
						li.innerHTML += '<pre class="extract"><code>' + ext + '</code></pre>';
					}
				}
				fragment.appendChild(errorList);
			} // function
			var h3 = fragment.appendChild(generatedDocument.createElement('h3'));
			h3.innerHTML = errorsAndWarnings;
			generateErrorList(result.messages);
			if (result.suppressedMessages.length)
			{
				h3 = fragment.appendChild(generatedDocument.createElement('h3'));
				h3.innerHTML = "Errors and warnings filtered out due to preference settings";
				generateErrorList(result.suppressedMessages);
			}
			docBody.insertBefore(container, docBody.firstChild);
			resultsLookup[resultId] = container.id;
			resultWindow.focus();
			resultWindow.scroll(0, 0);
			if (!isNewWindow)
			{
				resultWindow.location = RESULTWINDOW + "#" + container.id;
			}
		};
		populateResultWindow();
	},
	showOptionsDialog = function()
	{
		var win = window.openDialog("chrome://html5validator/content/options.xul", "html5validator-prefs", null);
		win.focus();
	},
	encodeHTML = function(html) {
		return html.replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
	};

	window.addEventListener("load", function(){
		gBrowser.addProgressListener(html5validatorListener);

		toolbarButton = document.getElementById('html5validator-status-bar');
		if (!toolbarButton) {
			var addonBar = document.getElementById('addon-bar');
			toolbarButton = addonBar.insertItem("html5validator-status-bar", null);
			addonBar.collapsed = false;
		}
		locationBarIcon = document.getElementById('html5validator-locationbar-icon');
		setTimeout(function(){validateDocHTML(false);}, 250);
		updateStatusBar(0, 0, 'reset');

		preferencesObserver.register();
		loadPreferences();
	}, false);

	return {
		showOptions: function()
		{
			showOptionsDialog();
		},

		onCommand: function()
		{
			statusBarPanelClick();
		},

		onHotKey: function()
		{
			if (locationBarIcon.hidden)
			{
				if (toolbarButton.parentNode.collapsed) {
					toolbarButton.parentNode.collapsed = false;
				}
				else if (toolbarButton.parentNode.hidden) {
					toolbarButton.parentNode.hidden = false; // status bar
				}
			}
			statusBarPanelClick();
		}
	};
}());
