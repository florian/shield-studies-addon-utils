"use strict";

const EXPORTED_SYMBOLS = ["Bootstrap"];

const { utils: Cu } = Components;
Cu.import("resource://gre/modules/Services.jsm");

this.Bootstrap = function(studySetup, studyUtils) {
  return {
    /**
     * Use console as our logger until there is a log() method in studyUtils that we can rely on
     */
    log: console,

    /**
     *
     * @param manifest
     * @param reason
     * @returns {Promise<void>}
     */
    async configure(extension) {
      const { manifest } = extension;

      const addonId = manifest.applications.gecko.id;
      const addonVersion = manifest.version;
      this.initStudyUtils(addonId, addonVersion);

      // choose and set variation
      await this.selectVariation();
    },

    async startup(extension) {
      const { startupReason } = extension;

      this.log.debug("startup", startupReason);

      // Check if the user is eligible to run this study using the |isEligible|
      // function when the study is initialized
      if (
        startupReason === "ADDON_INSTALL" ||
        startupReason === "ADDON_UPGRADE"
      ) {
        //  telemetry "enter" ONCE
        studyUtils.firstSeen();
        if (!studySetup.eligible) {
          this.log.debug("User is ineligible, ending study.");
          // 1. uses studySetup.endings.ineligible.url if any,
          // 2. sends UT for "ineligible"
          // 3. then uninstalls addon
          await studyUtils.endStudy({ reason: "ineligible" });
          return;
        }
      }

      if (studySetup.expired) {
        await studyUtils.endStudy({ reason: "expired" });
        return;
      }

      /*
      * Adds the study to the active list of telemetry experiments,
      * and sends the "installed" telemetry ping if applicable
      */
      await studyUtils.startup({ reason: startupReason });

      // log what the study variation and other info is.
      this.log.debug(`info ${JSON.stringify(studyUtils.info())}`);
    },

    initStudyUtils(id, version) {
      // validate study config
      studySetup.addon = { id, version };
      studyUtils.setup(studySetup);
      // TODO bdanforth: patch studyUtils to setLoggingLevel as part of setup method
      // studyUtils.setLoggingLevel(...);
    },

    // choose the variation for this particular user, then set it.
    async selectVariation() {
      const variation =
        this.getVariationFromPref(studySetup.weightedVariations) ||
        (await studyUtils.deterministicVariation(
          studySetup.weightedVariations,
        ));
      studyUtils.setVariation(variation);
      this.log.debug(`studyUtils has studySetup and variation.name: ${
        variation.name
      }.
      Ready to send telemetry`);
      return variation;
    },

    // helper to let Dev or QA set the variation name
    getVariationFromPref(weightedVariations) {
      const name = Services.prefs.getCharPref(
        studySetup.variationOverridePreference,
        "",
      );
      if (name !== "") {
        const variation = weightedVariations.filter(x => x.name === name)[0];
        if (!variation) {
          throw new Error(`about:config => ${
            studySetup.variationOverridePreference
          } set to ${name},
          but no variation with that name exists.`);
        }
        return variation;
      }
      return name;
    },

    /**
     * Shutdown needs to distinguish between USER-DISABLE and other
     * times that `endStudy` is called.
     *
     * studyUtils._isEnding means this is a '2nd shutdown'.
     */
    async shutdown(addonData, reason) {
      this.log.debug("shutdown", studyUtils.REASONS[reason] || reason);

      const isUninstall =
        reason === studyUtils.REASONS.ADDON_UNINSTALL ||
        reason === studyUtils.REASONS.ADDON_DISABLE;
      if (isUninstall) {
        this.log.debug("uninstall or disable");
      }

      if (isUninstall && !studyUtils._isEnding) {
        // we are the first 'uninstall' requestor => must be user action.
        this.log.debug("probably: user requested shutdown");
        studyUtils.endStudy({ reason: "user-disable" });
      }

      // normal shutdown, or 2nd uninstall request
    },

    uninstall(addonData, reason) {
      this.log.debug("uninstall", reason);
    },

    install(addonData, reason) {
      this.log.debug("install", reason);
      // handle ADDON_UPGRADE (if needful) here
    },
  };
};