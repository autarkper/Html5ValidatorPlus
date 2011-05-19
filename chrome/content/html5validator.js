/* namespacing technique adapted from http://blogger.ziesemer.com/2007/10/respecting-javascript-global-namespace.html */
if (!window.four56bereastreet) {var four56bereastreet = {};}

four56bereastreet.html5validator = (function()
{
	var Application = Components.classes["@mozilla.org/fuel/application;1"].getService(Components.interfaces.fuelIApplication);
	function normalizeUrl(url)
	{
		return url.replace(/#.*/, '');
	}

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
				validateDocHTML(window.content, false);
			}
		},

		console = Components.classes["@mozilla.org/consoleservice;1"].getService(Components.interfaces.nsIConsoleService),
		log = function(msg)
		{
			if (!console || !preferences.debug) {return;}
			console.logStringMessage('Html5ValidatorPlus: ' + msg);
		};

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
			activeDocument = window.content.document;
			updateStatusBar(0, 0, "reset");
			if (activeDocument && activeDocument.URL)
			{
				log("LocChange: " + activeDocument.URL);
				validateDocHTML(window.content, false);
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
				if (aWebProgress.DOMWindow === aWebProgress.DOMWindow.top) {
				/* It seems that on reload (F5) we get a STATE_START and a STATE_STOP on
					* the same location. If it is a case of going back and forth in the page history,
					* we get a STATE_START on the old location, and then STATE_STOP on the
					* new location.
					* We can use this heuristic to avoid invalidating our cache expect when there is
					* a genuine reload.
					* Tested in FF 5.02a.
				*/
					if (!aWebProgress.DOMWindow.content.document.URL || !isValidUrl(aWebProgress.DOMWindow.content.document.URL)) {
						return;
					}
					if (aStateFlags & Components.interfaces.nsIWebProgressListener.STATE_START) {
						log("State START: " + window.content.document.URL);
						this.lastStartURL = normalizeUrl(window.content.document.URL);
					}
					if (aStateFlags & Components.interfaces.nsIWebProgressListener.STATE_STOP) {
						log("State STOP: " + window.content.document.URL + ", aStatus: " + aStatus);
						if (normalizeUrl(window.content.document.URL) == this.lastStartURL)
						{
							log("Invalidate results cache: " + window.content.document.URL);
							vCache.invalidate(window.content.document);
						}
						this.lastStartURL = null;
						if (aStatus) { // error
							updateStatusBar(0,0, 'reload-document');
						}
						// attempt validation anyway, in case the main document was downloaded OK
						validateDocHTML(window.content, false);
					}
				}
			}
		},
		onProgressChange: function(aWebProgress, aRequest, curSelf, maxSelf, curTot, maxTot){},
		onStatusChange: function(aWebProgress, aRequest, aStatus, aMessage){},
		onSecurityChange: function(aWebProgress, aRequest, aState){}
	};

	var statusBarPanel, activeDocument,
	g_invalidUrlRe = /^(about|chrome):/,

	isValidUrl = function(url)
	{
		return url && !url.match(g_invalidUrlRe);
	},
	
	isWhitelistDomain = function(url)
	{
		if (!isValidUrl(url) || url == preferences.validatorURL) {
			return false;
		}

		// if no domains whitelisted, then validate all URLs
		if (!preferences.domainsWhitelist.length) {
			return preferences.useTrigger; // but only if auto-validation is not in effect
		}
		for (var i = 0; i < preferences.domainsWhitelist.length; i++)
		{
			var d = preferences.domainsWhitelist[i];
			if (d.indexOf('*') > 0) {
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
					return false;
				}
			} else if (d == url.replace('://www.', '://').substr(0, d.length)) {
				return true;
			}
		}

		return false;
	},


	vCache = (function()
	{
		function cache(key)
		{
			var cached = Application.storage.get(key, null);
			if (!cached) {
				cached = {};
				Application.storage.set(key, cached);
			}
			return cached;
		}
		function resCache() {return cache("resCache");}
		function navCache() {return cache("navCache");}

		var pub = {
			lookupResults: function(doc)
			{
				var url = normalizeUrl(doc.URL);
				var results = resCache()[url];
				if (!results) {
					return null;
				}
				return results[preferenceToken] || null;
			},
			storeResults: function(doc, result)
			{
				var url = normalizeUrl(doc.URL);
				var results = resCache()[url] || (resCache()[url] = {});
				results[preferenceToken] = result;
			},
			invalidate: function(doc)
			{
				var url = normalizeUrl(doc.URL);
				delete resCache()[url];
			},
			lookupNoAutoValidation: function(doc)
			{
				var url = normalizeUrl(doc.URL);
				return navCache()[url] || false;
			},
			storeNoAutoValidation: function(doc)
			{
				var url = normalizeUrl(doc.URL);
				navCache()[url] = true;
			}
		};
		return pub;
	}()),

	g_cleanup = null,
	g_validationTimerHandle = null,
	validateDocHTML = function(frame, triggered, optTimeoutMs)
	{
		var timeoutMs = optTimeoutMs || 100;
		if (g_cleanup) {g_cleanup();}
		if (g_validationTimerHandle) {
			window.clearTimeout(g_validationTimerHandle);
		}
		g_validationTimerHandle = window.setTimeout(function() {
			try {
				validateDocHTML__(frame, triggered, timeoutMs);
			}
			catch (err)
			{
				updateStatusBar(0, 0, 'internalError');
			}
		}, timeoutMs); // avoid calling validateDocHTML__ repeatedly in case of rapid state changes
	},

	// Adapted from the "HTML Validator" extension by Marc Gueury (http://users.skynet.be/mgueury/mozilla/)
	validateDocHTML__ = function(frame, triggered, optTimeoutMs)
	{
		if (isLoading())
		{
			updateStatusBar(0, 0, 'document-loading');
			validateDocHTML(frame, triggered, optTimeoutMs * 2); // come back later
			return;
		}
		
		var doc = activeDocument;
		if (!doc) {return;}

		var url = doc.URL || '';
		if (!url.length || url.match(g_invalidUrlRe))
		{
			updateStatusBar(0, 0, 'reset');
			return;
		}
		var html;
		if (triggered)
		{
			html = getHTMLFromCache(doc);
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
		// do not attempt auto-validation unless we have a visible UI
		var addonBar = document.getElementById('addon-bar') || document.getElementById('status-bar');
		if (addonBar && addonBar.collapsed) {
			updateStatusBar(0, 0, 'use-trigger'); // display a sensible message when uncollapsed
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
			if (vCache.lookupNoAutoValidation(doc))
			{
				updateStatusBar(0, 0, 'cancelled');
				return;
			}
			html = html || getHTMLFromCache(doc);
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
						stopTimeout();
						removeEscapeListener();
						vCache.storeNoAutoValidation(doc);
						updateStatusBar(0, 0, 'cancelled');
					}
				}
				removeEscapeListener = function(){doc.removeEventListener('keydown', cancelOnEscape, false);};

				doc.addEventListener('keydown', cancelOnEscape, false);
				timeoutHandle = window.setTimeout(function() // do not flood server, use a cancellable timeout
				{
					removeEscapeListener();
					if (addonBar && addonBar.collapsed) {
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
		return activeDocument;
	},

	isLoading = function()
	{
		return document.readyState === "loading";
	},

	// Adapted from the "HTML Validator" extension by Marc Gueury (http://users.skynet.be/mgueury/mozilla/)
	getHTMLFromCache = function(doc)
	{	 
		if (isLoading()) {
			log("getHTMLFromCache: is loading");
			return null;
		}

		// Part 1 : get the history entry (nsISHEntry) associated with the document
		var webNav = null;

		var win = doc.defaultView;
		if (win == window) {
			win = _content;
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
		var url = doc.URL;
		var urlCharset = doc.characterSet;

		var ios = Components.classes["@mozilla.org/network/io-service;1"].getService(Components.interfaces.nsIIOService);
		var channel = ios.newChannel(url, urlCharset, null);
		channel.loadFlags |= Components.interfaces.nsIRequest.VALIDATE_NEVER;
		channel.loadFlags |= Components.interfaces.nsIRequest.LOAD_FROM_CACHE;
		channel.loadFlags |= Components.interfaces.nsICachingChannel.LOAD_ONLY_FROM_CACHE;

		// Use the cache key to distinguish POST entries in the cache (see nsDocShell.cpp)
		var cacheChannel = channel.QueryInterface(Components.interfaces.nsICachingChannel);
		cacheChannel.cacheKey = shEntry.cacheKey;

		var stream = channel.open();

		const scriptableStream = Components.classes["@mozilla.org/scriptableinputstream;1"].createInstance(Components.interfaces.nsIScriptableInputStream);
		scriptableStream.init(stream);
		var s = '', s2 = '';

		while (scriptableStream.available() > 0)
		{
			s += scriptableStream.read(scriptableStream.available());
		}
		scriptableStream.close();
		stream.close();

		// Part 3 : convert the HTML in unicode
		var ucConverter =  Components.classes["@mozilla.org/intl/scriptableunicodeconverter"].getService(Components.interfaces.nsIScriptableUnicodeConverter);
		ucConverter.charset = urlCharset;
		s2 = ucConverter.ConvertToUnicode(s);

		return s2;
	},

	g_usbTimeoutHandle = null,
	updateStatusBar = function(errors, warnings, status)
	{
		if (g_usbTimeoutHandle) {window.clearTimeout(g_usbTimeoutHandle);}
		g_usbTimeoutHandle = window.setTimeout( function() {
			updateStatusBar__(errors, warnings, status);
		}, 100); // prevent flickering in case of user flipping through tabs, etc.
	},

	g_clickEnabled = true,
	updateStatusBar__ = function(errors, warnings, status)
	{
		log("updateStatusBar: " + status);
		if (errors || warnings) {
			var errorText = "";
			if (errors) {
				errorText += errors + " error";
			}
			if (errors > 1) {
				errorText += "s";
			}
			if (errors && warnings) {
				errorText += " and ";
			}
			if (warnings) {
				errorText += warnings + " warning";
			}
			if (warnings > 1) {
				errorText += "s";
			}
			statusBarPanel.label = errorText;
			statusBarPanel.src = "chrome://html5validator/skin/html5-error-red.png";
			statusBarPanel.className = "statusbarpanel-iconic-text errors";
			statusBarPanel.tooltipText = "HTML5 Validator Plus: Click to view validation details";
			g_clickEnabled = true;
		}
		else
		{
			g_clickEnabled = true;
			statusBarPanel.src = "chrome://html5validator/skin/html5-dimmed.png";
			statusBarPanel.className = "statusbarpanel-iconic-text";
			statusBarPanel.label = "Click to validate";
			switch (status) {
				case "reload-document":
					statusBarPanel.label = "Refresh (F5) required";
					statusBarPanel.tooltipText = "HTML5 Validator Plus: Document not in cache, refresh required";
					g_clickEnabled = false;
					break;
				case "document-loading":
					statusBarPanel.label = "Document loading...";
					statusBarPanel.tooltipText = "HTML5 Validator Plus: Document is loading, please wait";
					g_clickEnabled = false;
					break;
				case "running":
					statusBarPanel.label = "Validating...";
					statusBarPanel.tooltipText = "HTML5 Validator Plus: Document currently validating";
					g_clickEnabled = false;
					break;
				case "reset":
					statusBarPanel.label = "";
					statusBarPanel.tooltipText = "HTML5 Validator Plus: Idle";
					g_clickEnabled = false;
					break;
				case "use-trigger":
					statusBarPanel.tooltipText = "HTML5 Validator Plus: Auto-validation off, click to validate";
					break;
				case "large-doc":
					statusBarPanel.tooltipText = "HTML5 Validator Plus: Document too large for auto-validation, click to validate";
					break;
				case "cancelled":
					statusBarPanel.tooltipText = "HTML5 Validator Plus: Auto-validation cancelled, click to validate";
					break;
				case "about-to-validate":
					statusBarPanel.tooltipText = "HTML5 Validator Plus: Validation pending...";
					statusBarPanel.label = "Validation pending, press Escape to cancel";
					break;
				case "manual":
					statusBarPanel.tooltipText = "HTML5 Validator Plus: Domain not in whitelist, click to validate";
					break;
				case "restricted":
					statusBarPanel.label = "Restricted";
					statusBarPanel.tooltipText = "HTML5 Validator Plus: Domain not in whitelist, validation restricted";
					g_clickEnabled = false;
					break;
				case "errorValidator":
					statusBarPanel.label = "Validator error";
					statusBarPanel.tooltipText = "HTML5 Validator Plus: Could not contact the validator, at '" + preferences.validatorURL + "'";
					break;
				case "badResponse":
					statusBarPanel.label = "Validator problem";
					statusBarPanel.tooltipText = "HTML5 Validator Plus: Bad response from validator, at '" + preferences.validatorURL + "'";
					break;
				case "internalError":
					statusBarPanel.label = "Internal Error";
					statusBarPanel.tooltipText = "HTML5 Validator Plus: Some internal error occurred";
					break;
				case "results":
					statusBarPanel.src = "chrome://html5validator/skin/html5-ok.png";
					statusBarPanel.label = "";
					statusBarPanel.tooltipText = "HTML5 Validator Plus: No errors. Click to view validation details";
					break;
				default:
					statusBarPanel.label = "internal error";
					break;
			}
		}
	},

	validateDoc = function(doc, html)
	{
		if (html.length === 0) {return;}
		updateStatusBar(0, 0, "running");

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
				vCache.storeResults(doc, {
					"timestamp": new Date(),
					"parser": preferences.parser,
					"messages": filteredMessages,
					"suppressedMessages": suppressedMessages,
					"errors": errors,
					"warnings": warnings
				});
				if (doc === activeDocument) // asynchronous, may have changed
				{
					updateStatusBar(errors, warnings, "results");
				}
			}
		};

		// If we couldn't validate the document (validator not running, network down, etc.)
		xhr.onload = function () {
			try {
				onload();
			}
			catch (err) {
				log(err);
				updateStatusBar(0, 0, "badResponse");
			}
		};
		xhr.onerror = function(){
			updateStatusBar(0, 0, "errorValidator");
		};

		// Send document to validator and tell it to return results in JSON format
		var parserOpt = preferences.parser.length ? "&parser=" + preferences.parser : '';
		xhr.open("POST", preferences.validatorURL + "?out=json" + parserOpt, true);
		xhr.setRequestHeader("Content-Type", "text/html;charset=UTF-8");
		xhr.send(html);
	},

	statusBarPanelClick = function(event)
	{
		// event.button: 0 - left, 1 - middle, 2 - right
		if (event.button === 0)
		{
			var doc = getActiveDocument();
			if (!doc) {
				log("statusBarPanelClick: no document");
				return;
			}

			// On first click there are no cached results - validate, on following clicks - show cached results
			if (vCache.lookupResults(doc)) {
				showValidationResults();
			}
			else if (g_clickEnabled) {
				validateDocHTML(window.content, true);
			}
			else {
				showOptionsDialog();
			}
		}
	},

	findWindowWithURL = function(url)
	{ // Adapted from: https://developer.mozilla.org/en/Code_snippets/Tabbed_browser
		var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
			.getService(Components.interfaces.nsIWindowMediator);
		var browserEnumerator = wm.getEnumerator("navigator:browser");
		url = normalizeUrl(url);
		// Check each browser instance for our URL
		while (browserEnumerator.hasMoreElements()) {
			var browserWin = browserEnumerator.getNext();
			var tabbrowser = browserWin.gBrowser;

			// Check each tab of this browser instance
			var numTabs = tabbrowser.browsers.length;
			for (var index = 0; index < numTabs; index++) {
				var currentBrowser = tabbrowser.getBrowserAtIndex(index);
				if (url == normalizeUrl(currentBrowser.currentURI.spec)) {
					return currentBrowser.contentWindow;
				}
			}
		}
		return null;
	},

	// Display the cached validation results in a separate window.
	g_resultWindow = null,
	RESULTWINDOW = 'chrome://html5validator/content/resultswindow.html',
	showValidationResults = function()
	{
		var doc = getActiveDocument();
		if (!doc || !vCache.lookupResults(doc)) {
			return;
		}

		var openInTab = preferences.displayResultsInTab;
		if (openInTab || !g_resultWindow || g_resultWindow.closed)
		{
			function openNewTab()
			{
				var tab = getBrowser().addTab(RESULTWINDOW);
				getBrowser().selectedTab = tab;
				var newbrowser = getBrowser().getBrowserForTab(tab);
				return newbrowser.contentWindow;
			}
			function findOrOpenWindow() {
				return findWindowWithURL(RESULTWINDOW) || window.open(RESULTWINDOW, 'html5validator');
			}
			g_resultWindow = openInTab ? openNewTab() : findOrOpenWindow();
		}
		/* window.open returns before the new window is fully initialized, so we have to wait for it to
		 initialize. "window.addEventListener('load', ...)" does not seem to work, so a simple timeout
		 loop is used instead.
		 */
		var timeoutMs = 25;
		var populateResultWindow = function()
		{
			var generatedDocument = g_resultWindow.document;
			if (generatedDocument.readyState !== "complete") {
				log("results window state: " + generatedDocument.readyState);
				timeoutMs = timeoutMs * 2; // increasingly less aggressive timeout
				setTimeout(populateResultWindow, timeoutMs);
				return;
			}
			var resultsLookup = generatedDocument.resultsLookup || (generatedDocument.resultsLookup = {});
			var lastId = generatedDocument.lastId || 0;
			var lastDocTitle = generatedDocument.lastDocTitle || '';
			var result = vCache.lookupResults(doc);
			var resultId = result.timestamp.getTime();
			if (resultsLookup[resultId])
			{
				log(resultId);
				g_resultWindow.focus();
				g_resultWindow.location = RESULTWINDOW + "#" + resultsLookup[resultId];
				return;
			}
			var docBody = generatedDocument.getElementsByTagName('body')[0];

			var parserStr = " [parser:" + (result.parser.length ? result.parser : 'inferred') + "]";
			var docTitle = 'Validation results for ' + doc.URL + parserStr;
			var errorsAndWarnings = result.errors + ' errors and ' + result.warnings + ' warnings';
			/* Create the HTML content of the body – a heading and the list of messages with some elements and class names to enable styling */

			var fragment = generatedDocument.createElement("DIV");
			fragment.id = 'section' + lastId;
			var linkList = fragment.appendChild(generatedDocument.createElement("UL"));
			linkList.className = "prevnext";
			var elNoResult = generatedDocument.getElementById('no-results');
			if (elNoResult) {
				elNoResult.parentNode.removeChild(elNoResult);
			}
			else {
				docBody.insertBefore(generatedDocument.createElement("HR"), docBody.firstChild);

				var li = linkList.appendChild(generatedDocument.createElement("LI"));
				var fwdLink = li.appendChild(generatedDocument.createElement("A"));
				fwdLink.href = '#section' + (lastId - 1);
				fwdLink.textContent = "Next";
				fwdLink.title = lastDocTitle;

				li = generatedDocument.linkList.appendChild(generatedDocument.createElement("LI"));
				var backLink = li.appendChild(generatedDocument.createElement("A"));
				backLink.href = "#" + fragment.id;
				backLink.textContent = "Previous";
				backLink.title = docTitle;
			}
			generatedDocument.linkList = linkList;

			generatedDocument.lastId = lastId + 1;
			var h1 = fragment.appendChild(generatedDocument.createElement('h1'));
			h1.innerHTML = docTitle;
			generatedDocument.lastDocTitle = docTitle;
			var dateP = fragment.appendChild(generatedDocument.createElement('p'));
			dateP.textContent = "Display timestamp: " + (new Date()).toLocaleString();
			dateP = fragment.appendChild(generatedDocument.createElement('p'));
			dateP.textContent = "Validation timestamp: " + result.timestamp.toLocaleString();

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
			var h2 = fragment.appendChild(generatedDocument.createElement('h2'));
			h2.innerHTML = errorsAndWarnings;
			generateErrorList(result.messages);
			if (result.suppressedMessages.length)
			{
				h2 = fragment.appendChild(generatedDocument.createElement('h2'));
				h2.innerHTML = "Errors and warnings filtered out due to preference settings";
				generateErrorList(result.suppressedMessages);
			}
			docBody.insertBefore(fragment, docBody.firstChild);
			resultsLookup[resultId] = fragment.id;
			g_resultWindow.focus();
			g_resultWindow.location = RESULTWINDOW + "#" + fragment.id;
		};
		setTimeout(populateResultWindow, timeoutMs); // FF < 4.0 seems to need a timeout even for the first invocation
	},
	showOptionsDialog = function()
	{
		var win = window.openDialog("chrome://html5validator/content/options.xul", "html5validator-prefs", null);
		win.focus();
	},
	encodeHTML = function(html) {
		return html.replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
	};

	return {
		init: function ()
		{
			loadPreferences();

			gBrowser.addProgressListener(html5validatorListener);

			statusBarPanel = document.getElementById('html5validator-status-bar');
			statusBarPanel.addEventListener("click", statusBarPanelClick, false);

			updateStatusBar(0, 0, 'reset');

			preferencesObserver.register();
		},
		
		showOptions: function()
		{
			showOptionsDialog();
		}
	};
}());

window.addEventListener("load", four56bereastreet.html5validator.init, false);
