# HTML5 Validator Plus

HTML5 Validator Plus is a forked version of Roger Johansson's HTML5 Validator, a Firefox add-on that helps with validating HTML(5) source using the validator.nu engine (online or local instance).

Basically, HTML5 Validator Plus has more options than the original, and it optionally displays validation results in a separate window so you can easily switch between the validated page and the results page. One important design goal to limit the number of unnecessary calls to the validator, which is especially useful if you don't have a local validator. Thus, an empty domain whitelist effectively disables auto-validation, but if you really want global auto-validation you can have a single "*" entry instead.

Furthermore, HTML5 Validator Plus keeps a cache of validation results that is shared between different tabs, compared to the original version, which ties the validation result to the relatively short-lived and isolated DOM document object (which causes validation results to be lost when flipping more than a few levels back and forth in the page history).

Another enhancement is the ability to choose which parser the validator should use. The filtering of validator error and warning messages is also enhanced to filter out the validator's rather pointless error message in case your pages use some other encoding than UTF-8. Just to make sure you don't miss out on any important message, all other messages, including info messages and suppressed error or warning messages, are displayed on the results page, even if they don't affect the error and warning count.

The validation results page keeps a running log of all results viewed in the current browsing session, as long as you keep the window open, with the latest results on top. The results window is reused between sessions, if possible, so you will not end up with lots of old windows saved from previous sessions.
