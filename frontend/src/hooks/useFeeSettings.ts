import { useCallback, useEffect, useState } from 'react';
import { api, apiErrorMessage } from '@/lib/api';

export interface FeeSettingsState {
  id: string;
  tenantId: string;
  admissionFee: {
    enabled: boolean;
    allowReAdmission: boolean;
  };
  otherFee: {
    enabled: boolean;
    feeName: string;
    defaultAmount: number; // in paisa
  };
  lateFee: {
    enabled: boolean;
    lateFeeAmount: number; // in paisa
    gracePeriodDays: number;
  };
  dueDate: {
    enabled: boolean;
    defaultMonthlyDueDay: number;
  };
  discount: {
    enabled: boolean;
    allowDiscountStacking: boolean;
  };
  updatedAt?: string;
}

const DEFAULT_SETTINGS: FeeSettingsState = {
  id: '',
  tenantId: '',
  admissionFee: { enabled: true, allowReAdmission: false },
  otherFee: { enabled: false, feeName: 'Other Fee', defaultAmount: 0 },
  lateFee: { enabled: true, lateFeeAmount: 10000, gracePeriodDays: 2 },
  dueDate: { enabled: true, defaultMonthlyDueDay: 10 },
  discount: { enabled: true, allowDiscountStacking: false },
};

export function useFeeSettings() {
  const [settings, setSettings] = useState<FeeSettingsState>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ success: boolean; data: FeeSettingsState }>('/fee-settings');
      if (res.data?.data) {
        setSettings(res.data.data);
      }
    } catch (err: any) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  return {
    settings,
    loading,
    error,
    refresh: fetchSettings,
    // Convenience feature flags
    hasDueDate: settings.dueDate.enabled,
    defaultDueDay: settings.dueDate.defaultMonthlyDueDay,
    hasLateFee: settings.lateFee.enabled,
    lateFeeAmountPaisa: settings.lateFee.lateFeeAmount,
    gracePeriodDays: settings.lateFee.gracePeriodDays,
    hasOtherFee: settings.otherFee.enabled,
    otherFeeName: settings.otherFee.feeName || 'Other Fee',
    otherFeeAmountPaisa: settings.otherFee.defaultAmount,
    hasDiscounts: settings.discount.enabled,
    allowDiscountStacking: settings.discount.allowDiscountStacking,
    hasAdmissionFee: settings.admissionFee.enabled,
    allowReAdmission: settings.admissionFee.allowReAdmission,
  };
}
