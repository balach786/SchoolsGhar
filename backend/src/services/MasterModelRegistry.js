"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMasterModels = getMasterModels;
var Tenant_1 = require("../models/Tenant");
var SubscriptionPlan_1 = require("../models/SubscriptionPlan");
var SubscriptionPayment_1 = require("../models/SubscriptionPayment");
var SubscriptionHistory_1 = require("../models/SubscriptionHistory");
var PlatformNotification_1 = require("../models/PlatformNotification");
function getMasterModels(masterDb) {
    return {
        Tenant: masterDb.models.Tenant || masterDb.model('Tenant', Tenant_1.Tenant.schema),
        SubscriptionPlan: masterDb.models.SubscriptionPlan || masterDb.model('SubscriptionPlan', SubscriptionPlan_1.SubscriptionPlan.schema),
        SubscriptionPayment: masterDb.models.SubscriptionPayment || masterDb.model('SubscriptionPayment', SubscriptionPayment_1.SubscriptionPayment.schema),
        SubscriptionHistory: masterDb.models.SubscriptionHistory || masterDb.model('SubscriptionHistory', SubscriptionHistory_1.SubscriptionHistory.schema),
        PlatformNotification: masterDb.models.PlatformNotification || masterDb.model('PlatformNotification', PlatformNotification_1.PlatformNotification.schema),
    };
}
