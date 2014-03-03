# HTML5 Validator Plus

HTML5 Validator Plus is an enhanced version of Roger Johansson's HTML5 Validator, a Firefox add-on that helps with validating HTML(5) source using the validator.nu engine (online or local instance).

One important design goal of the HTML5 Validator Plus enhancements is to limit the number of requests to the validator, which is especially useful if you don't have a local validator. Thus, an empty domain whitelist effectively disables auto-validation, but if you really want global auto-validation you can have a single "*" entry instead.

With HTML5 Validator Plus you can choose to see the validation results in a separate window or in a new tab next to the current tab. Both options are set up so you can easily switch between the validated page and the results page. The validation results window keeps a running log of all results viewed in the current browsing session, as long as you keep the window open, with the latest results on top. All results windows and tabs are automatically closed if opened empty, so you will not end up with lots of old browser windows or tabs saved from previous sessions after a restart.

Furthermore, HTML5 Validator Plus keeps a cache of validation results that is shared between all tabs and windows for the duration of the browser session, which means that if you have the same validated document open in different tabs they will share the same validation result until the document is reloaded. Each cached validation result is indexed on the validation settings in effect when performing the validation, so if you switch back and forth between different settings you will not lose any old validation results, as long as you don't reload the validated document.

Another enhancement is the ability to choose which parser the validator should use. The filtering of validator error and warning messages is also enhanced to filter out the validator's rather pointless error message in case your pages use some other encoding than UTF-8. Just to make sure you don't miss out on any important message, all other messages, including info messages and suppressed error or warning messages, are displayed on the results page, even if they don't affect the error and warning count.

HTML5 Validator Plus has native support for the new add-on bar in Firefox 4 and above. It can optionally show its icon in the location bar so the add-on bar doesn't have to be visible all the time. At all times, CTRL+SHIFT+V is the keyboard equivalent to clicking the validator icon.

HTML5 Validator Plus was developed and tested in Firefox 4 and alpha/beta versions of Firefox 5, 6 and 7; the minimum supported Firefox version is 3.6.

Latest release: http://www.autark.se/Html5ValidatorPlus/html5validatorplus@autark.se-3.0.1.0.xpi

Known bugs and problems: Currently none.

Acknowledgements: Many thanks to Roger Johansson and contributors to the original HTML5 Validator, who did all the hard work while I had all the fun.
