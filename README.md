# HTML5 Validator

This is a fork of Roger Johansson's HTML5 Validator, a Firefox add-on that helps with validating the HTML source using the validator.nu engine (online or local instance).

Basically this fork has more options than the original, and it displays validation results in a separate window for convenience. It is designed to limit the number of unnecessary calls to the validator, which is especially useful if you don't have a local validator. In particular, it keeps a longer-life cache of validation results that is shared between different tabs, compared to the original version, which ties the validation result to the relatively short-lived and isolated DOM document object.
