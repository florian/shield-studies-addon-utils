/* eslint-env commonjs */

/* global ExtensionAPI */

ChromeUtils.import("resource://gre/modules/ExtensionCommon.jsm");
ChromeUtils.import("resource://gre/modules/ExtensionUtils.jsm");
ChromeUtils.import("resource://gre/modules/Services.jsm");

// eslint-disable-next-line no-undef
const { EventManager } = ExtensionCommon;
// eslint-disable-next-line no-undef
const { EventEmitter } = ExtensionUtils;

// eslint-disable-next-line no-unused-vars
class Foo extends EventEmitter {
  foo() {
    this.emit("foo");
  }
}

this.study = class extends ExtensionAPI {
  /**
   * We don't need to override the constructor for other
   * reasons than to clarify the class member "extension"
   * being of type Extension
   *
   * @param extension Extension
   */
  constructor(extension) {
    super(extension);
    /**
     * @type Extension
     */
    this.extension = extension;
  }

  /**
   * Extension Shutdown
   * APIs that allocate any resources (e.g., adding elements to the browser’s
   * user interface, setting up internal event listeners, etc.) must free
   * these resources when the extension for which they are allocated is
   * shut down.
   */
  onShutdown(shutdownReason) {
    console.log("onShutdown", shutdownReason);
    // TODO: debootstrap study
  }

  getAPI(context) {
    const { studyUtils } = require("./studyUtils.js");
    const studyUtilsBootstrap = require("./studyUtilsBootstrap.js");
    // const { PioneerUtils } = require("pioneer-utils/PioneerUtils.jsm");
    // const pioneerUtilsBootstrap = require("./pioneerUtilsBootstrap.js");

    let bootstrap;

    const { extension } = this;

    return {
      study: {
        /**
         * Schema.json `functions`
         */

        /* Attempt an setup/enrollment, with these effects:

  - sets 'studyType' as Shield or Pioneer
    - affects telemetry
    - watches for dataPermission changes that should *always*
      stop that kind of study

  - Use or choose variation
    - `testing.variation` if present
    - OR deterministicVariation
      for the studyType using `weightedVariations`

  - During firstRun[1] only:
    - set firstRunTimestamp pref value
    - send 'enter' ping
    - if `allowEnroll`, send 'install' ping
    - else endStudy("ineligible") and return

  - Every Run
    - setActiveExperiment(studySetup)
    - monitor shield | pioneer permission endings
    - suggests alarming if `expire` is set.

  Returns:
  - studyInfo object (see `getStudyInfo`)

  Telemetry Sent (First run only)

    - enter
    - install

  Fires Events

  (At most one of)
  - study:onReaday  OR
  - study:onEndStudy

  Preferences set
  - `shield.${runtime.id}.firstRunTimestamp`

  Note:
  1. allowEnroll is ONLY used during first run (install)
   */
        setup: async function setup(studySetup) {
          bootstrap = studyUtilsBootstrap.Bootstrap(studySetup, studyUtils);
          await bootstrap.configure(extension);
          await bootstrap.startup(extension);
        },

        /* Signal to browser.study that it should end.

  Usage scenarios:
  - addons defined
    - postive endings (tried feature)
    - negative endings (client clicked 'no thanks')
    - expiration / timeout (feature should last for 14 days then uninstall)

  Logic:
  - If study has already ended, do nothing.
  - Else: END

  END:
  - record internally that study is ended.
  - disable all methods that rely on configuration / setup.
  - clear all prefs stored by `browser.study`
  - fire telemetry pings for:
    - 'exit'
    - the ending, one of:

      "ineligible",
      "expired",
      "user-disable",
      "ended-positive",
      "ended-neutral",
      "ended-negative",

  - augment all ending urls with query urls
  - fire 'study:end' event to `browser.study.onEndStudy` handlers.

  Addon should then do
  - open returned urls
  - feature specific cleanup
  - uninstall the addon

  Note:
  1.  calling this function multiple time is safe.
  `browser.study` will choose the
   */
        endStudy: async function endStudy(anEndingAlias, anEndingObject) {
          console.log("called endStudy anEndingAlias");
          return studyUtils.endStudy({
            reason: anEndingAlias,
            fullname: anEndingAlias,
          });
          // return { urls: ["url1", "url2"], endingName: "some-reason" };
        },

        /* current study configuration, including
  - variation
  - activeExperimentName
  - timeUntilExpire
  - firstRunTimestamp

  But not:
  - telemetry clientId

  Throws Error if called before `browser.study.setup`
   */
        getStudyInfo: async function getStudyInfo() {
          console.log("called getStudyInfo ");
          return studyUtils.info();
          /*
          return {
            variation: "styleA",
            firstRunTimestamp: 1523968204184,
            activeExperimentName: "some experiment",
            timeUntilExpire: null,
          };
          */
        },

        /* object of current dataPermissions with keys shield, pioneer, telemetry, 'ok' */
        getDataPermissions: async function getDataPermissions() {
          console.log("called getDataPermissions ");
          return {
            shield: true,
            pioneer: false,
            telemetry: true,
            alwaysPrivateBrowsing: false,
          };
        },

        /* Send Telemetry using appropriate shield or pioneer methods.

  shield:
  - `shield-study-addon` ping, requires object string keys and string values

  pioneer:
  - TBD

  Note:
  - no conversions / coercion of data happens.

  Note:
  - undefined what happens if validation fails
  - undefined what happens when you try to send 'shield' from 'pioneer'

  TBD fix the parameters here.
   */
        sendTelemetry: async function sendTelemetry(payload) {
          console.log("called sendTelemetry payload");
          function throwIfInvalid(obj) {
            // Check: all keys and values must be strings,
            for (const k in obj) {
              if (typeof k !== "string")
                throw new Error(`key ${k} not a string`);
              if (typeof obj[k] !== "string")
                throw new Error(`value ${k} ${obj[k]} not a string`);
            }
            return true;
          }

          throwIfInvalid(payload);
          studyUtils.telemetry(payload);
        },

        /* Search locally stored telemetry pings using these fields (if set)

  n:
    if set, no more than `n` pings.
  type:
    Array of 'ping types' (e.g., main, crash, shield-study-addon) to filter
  mininumTimestamp:
    only pings after this timestamp.
  headersOnly:
    boolean.  If true, only the 'headers' will be returned.

  Pings will be returned sorted by timestamp with most recent first.

  Usage scenarios:
  - enrollment / eligiblity using recent Telemetry behaviours or client environment
  - addon testing scenarios
   */
        searchSentTelemetry: async function searchSentTelemetry(
          searchTelemetryQuery,
        ) {
          console.log("called searchSentTelemetry searchTelemetryQuery");
          const { getTelemetryPings } = require("./pings.js");
          return getTelemetryPings(searchTelemetryQuery);
          // return [{ pingType: "main" }];
        },

        /* Choose a element from `weightedVariations` array
  based on various hashes of clientId

  - shield:  TBD
  - pioneer: TBD
   */
        deterministicVariation: async function deterministicVariation(
          weightedVariations,
          algorithm,
          fraction,
        ) {
          console.log(
            "called deterministicVariation weightedVariations, algorithm, fraction",
          );
          return await studyUtils.deterministicVariation(
            weightedVariations,
            fraction,
          );
          // return "styleA";
        },

        /* Format url with study covariate queryArgs appended / mixed in.

  Use this for constructing midpoint surveys.
   */
        surveyUrl: async function surveyUrl(baseUrl, additionalFields) {
          console.log("called surveyUrl baseUrl, additionalFields");
          return "https://example.com?version=59.0&branch=studyA";
        },

        /* Using AJV, do jsonschema validation of an object.  Can be used to validate your arguments, packets at client. */
        validateJSON: async function validateJSON(someJson, jsonschema) {
          console.log("called validateJSON someJson, jsonschema");
          return { valid: true, errors: [] };
        },

        /* @TODO no description given */
        log: async function log(thingToLog) {
          console.log("called log thingToLog");
          return undefined;
        },

        /**
         * Schema.json `events`
         */

        // https://firefox-source-docs.mozilla.org/toolkit/components/extensions/webextensions/events.html
        /* Fires whenever any 'dataPermission' changes, with the new dataPermission object.  Allows watching for shield or pioneer revocation. */
        onDataPermissionsChange: new EventManager(
          context,
          "study:onDataPermissionsChange",
          fire => {
            /*
            const callback = value => {
              fire.async(value);
            };
            */
            // RegisterSomeInternalCallback(callback);
            return () => {
              // UnregisterInternalCallback(callback);
            };
          },
        ).api(),

        // https://firefox-source-docs.mozilla.org/toolkit/components/extensions/webextensions/events.html
        /* Fires when the study is 'ready' for the feature to startup. */
        onReady: new EventManager(context, "study:onReady", fire => {
          /*
          const callback = value => {
            fire.async(value);
          };
          */
          // RegisterSomeInternalCallback(callback);
          return () => {
            // UnregisterInternalCallback(callback);
          };
        }).api(),

        // https://firefox-source-docs.mozilla.org/toolkit/components/extensions/webextensions/events.html
        /* Listen for when the study wants to end.

  Act on it by
  - opening surveyUrls
  - tearing down your feature
  - uninstalling the addon
   */
        onEndStudy: new EventManager(context, "study:onEndStudy", fire => {
          /*
          const callback = value => {
            fire.async(value);
          };
          */
          // RegisterSomeInternalCallback(callback);
          return () => {
            // UnregisterInternalCallback(callback);
          };
        }).api,

        /**
         * Schema.json `properties`
         */
      },
    };
  }
};

this.studyTest = class extends ExtensionAPI {
  getAPI(context) {
    const { studyUtils } = require("./studyUtils.js");
    return {
      studyTest: {
        async firstSeen() {
          return studyUtils.firstSeen();
        },

        async setActive() {
          return studyUtils.setActive();
        },

        async startup({ reason }) {
          return studyUtils.startup({ reason });
        },
      },
    };
  }
};

this.prefs = class extends ExtensionAPI {
  /** TODO, change obsersers into signal emitters.
   *
   */
  getAPI(context) {
    return {
      prefs: {
        async getStringPref(aPrefName, aDefaultValue) {
          // eslint-disable-next-line no-undef
          return Services.prefs.getStringPref(aPrefName, aDefaultValue);
        },
      },
    };
  }
};
