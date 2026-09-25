import { Connection, Model } from 'mongoose';
import { Tenant, ITenant } from '../models/Tenant';
import { SubscriptionPlan, ISubscriptionPlan } from '../models/SubscriptionPlan';
import { SubscriptionPayment, ISubscriptionPayment } from '../models/SubscriptionPayment';
import { SubscriptionHistory, ISubscriptionHistory } from '../models/SubscriptionHistory';
import { PlatformNotification, IPlatformNotification } from '../models/PlatformNotification';

export interface MasterModels {
  Tenant: Model<ITenant>;
  SubscriptionPlan: Model<ISubscriptionPlan>;
  SubscriptionPayment: Model<ISubscriptionPayment>;
  SubscriptionHistory: Model<ISubscriptionHistory>;
  PlatformNotification: Model<IPlatformNotification>;
}

export function getMasterModels(masterDb: Connection): MasterModels {
  return {
    Tenant: masterDb.models.Tenant || masterDb.model<ITenant>('Tenant', Tenant.schema),
    SubscriptionPlan: masterDb.models.SubscriptionPlan || masterDb.model<ISubscriptionPlan>('SubscriptionPlan', SubscriptionPlan.schema),
    SubscriptionPayment: masterDb.models.SubscriptionPayment || masterDb.model<ISubscriptionPayment>('SubscriptionPayment', SubscriptionPayment.schema),
    SubscriptionHistory: masterDb.models.SubscriptionHistory || masterDb.model<ISubscriptionHistory>('SubscriptionHistory', SubscriptionHistory.schema),
    PlatformNotification: masterDb.models.PlatformNotification || masterDb.model<IPlatformNotification>('PlatformNotification', PlatformNotification.schema),
  };
}
