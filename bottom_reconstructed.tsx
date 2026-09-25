      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  const loadMatrix = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    try {
      const res = await api.get<{ data: MatrixResponse }>(`/fee-structures/matrix?sessionId=${sessionId}&feeType=${feeType}`);
      setMatrixData(res.data.matrix);
      
      const newEdits: Record<string, Record<string, string>> = {};
      res.data.matrix.forEach(row => {
        newEdits[row.classId] = {};
        Object.entries(row.amounts).forEach(([m, amt]) => {
          newEdits[row.classId][m] = amt !== null ? (amt / 100).toString() : '';
        });
  const [busy, setBusy] = useState(false);

  // Form Fields
  const [formSessionId, setFormSessionId] = useState('');
  const [formFeeType, setFormFeeType] = useState('monthly_tuition');
  const [formTitle, setFormTitle] = useState('');
  const [formMonth, setFormMonth] = useState<number | null>(null);
  const [formEffectiveFromMonth, setFormEffectiveFromMonth] = useState<number | null>(null);
  const [formEffectiveFromYear, setFormEffectiveFromYear] = useState<number | null>(null);
  const [formDueDate, setFormDueDate] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formRows, setFormRows] = useState<{ classId: string; amountPkr: string }[]>([{ classId: '', amountPkr: '' }]);

  // Generation Modal
  const [generateTarget, setGenerateTarget] = useState<FeeRow | null>(null);
  const [genMonth, setGenMonth] = useState<number>(new Date().getMonth() + 1);
  const [genYear, setGenYear] = useState<number>(new Date().getFullYear());
  const [genBusy, setGenBusy] = useState(false);
  const [genEligibleCount, setGenEligibleCount] = useState<number | null>(null);
  const [genExistingCount, setGenExistingCount] = useState<number | null>(null);
  const [genCheckLoading, setGenCheckLoading] = useState(false);

  // Archive Target
  const [archiveTarget, setArchiveTarget] = useState<FeeRow | null>(null);

  const canCreate = can('fees', 'create');
  const canEdit = can('fees', 'edit');

  // Load Sessions
  useEffect(() => {
    let mounted = true;
    api
      .get<ApiListResponse<SessionRow>>('/academic-sessions?limit=50')
      .then((r) => {
        if (mounted && r.data?.data) {
          const valid = r.data.data.filter((s) => !s.isArchived);
          setSessions(valid);
          const active = valid.find((s) => s.isActive);
          if (active) {
            setSessionId(active._id);
            setFormSessionId(active._id);
          } else if (valid.length > 0) {
            setSessionId(valid[0]._id);
            setFormSessionId(valid[0]._id);
          }
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  // Load Classes for selected session
  useEffect(() => {
    if (!sessionId) return;
    let mounted = true;
    api
      .get<ApiListResponse<ClassRow>>(`/classes?sessionId=${sessionId}&limit=100`)
      .then((r) => {
        if (mounted && r.data?.data) {
          setClasses(r.data.data.filter((c) => !c.isArchived));
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [sessionId]);

  // Load Structures
  const loadStructures = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(pagination.page),
        limit: String(pagination.limit),
      });
      if (sessionId) params.set('sessionId', sessionId);
      if (classId && classId !== 'all') params.set('classId', classId);
      if (feeType !== 'all') params.set('feeType', feeType);

      const res = await api.get<ApiListResponse<FeeRow>>(`/fee-structures?${params}`);
      setData(res.data.data);
      setPagination(res.data.pagination);
    } catch (err: any) {
      toast.error(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, sessionId, classId, feeType]);

  useEffect(() => {
    loadStructures();
  }, [loadStructures]);

  function openCreate() {
    setEditing(null);
    setFormSessionId(sessionId || (sessions[0]?._id ?? ''));
    setFormFeeType('monthly_tuition');
    setFormTitle('');
    setFormMonth(null);
    setFormEffectiveFromMonth(null);
    setFormEffectiveFromYear(null);
    setFormDueDate('');
    setFormDesc('');
    setFormRows([{ classId: classes[0]?._id ?? '', amountPkr: '' }]);
    setFormOpen(true);
  }

  function openEdit(row: FeeRow) {
    setEditing(row);
    setFormSessionId(row.sessionId);
    setFormFeeType(row.feeType);
    setFormTitle(row.title);
    setFormMonth(row.month);
    setFormEffectiveFromMonth(row.effectiveFromMonth);
    setFormEffectiveFromYear(row.effectiveFromYear);
    setFormDueDate(row.dueDate ? row.dueDate.split('T')[0] : '');
    setFormDesc(row.description || '');
    setFormRows([{ classId: row.classId, amountPkr: String(row.amount / 100) }]);
    setFormOpen(true);
  }

  async function handleSaveStructure(e: React.FormEvent) {
    e.preventDefault();
    if (!formTitle.trim()) {
      toast.error('Title is required');
      return;
    }
    
    // Validation
    for (let i = 0; i < formRows.length; i++) {
      const row = formRows[i];
      if (!row.classId) return toast.error(`Please select a class in row ${i + 1}`);
      const amt = parseFloat(row.amountPkr);
      if (isNaN(amt) || amt <= 0) return toast.error(`Please enter a valid amount in row ${i + 1}`);
    }

    setBusy(true);
    try {
      const basePayload: Record<string, any> = {
        title: formTitle.trim(),
        description: formDesc.trim() || undefined,
      };

      if (formFeeType === 'monthly_tuition' && formMonth) {
        basePayload.month = formMonth;
      } else {
        basePayload.month = null;
      }

      basePayload.effectiveFromMonth = formEffectiveFromMonth || null;
      basePayload.effectiveFromYear = formEffectiveFromYear || null;

      if (hasDueDate && formDueDate) {
        basePayload.dueDate = new Date(formDueDate).toISOString();
      }

      if (editing) {
        const amt = parseFloat(formRows[0].amountPkr);
        await api.patch(`/fee-structures/${editing._id}`, {
          ...basePayload,
          amount: toPaisa(amt),
        });
        toast.success('Fee structure updated successfully');
      } else {
        const promises = formRows.map(row => {
          return api.post('/fee-structures', {
            ...basePayload,
            sessionId: formSessionId,
            classId: row.classId,
            feeType: formFeeType,
            amount: toPaisa(parseFloat(row.amountPkr)),
          });
        });
        await Promise.all(promises);
        toast.success(`${formRows.length} Fee structure(s) created successfully`);
      }
      setFormOpen(false);
      loadStructures();
    } catch (err: any) {
      toast.error(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  // Pre-check eligible student count when generation dialog opens or month/year changes
  const loadGenPreCheck = useCallback(async (target: FeeRow, m: number, y: number) => {
    setGenCheckLoading(true);
    try {
      // Count eligible students (active, non-archived, in this class/session)
      const stuRes = await api.get<ApiListResponse<{ _id: string }>>(
        `/students?sessionId=${target.sessionId}&classId=${target.classId}&limit=1&isActive=true`
      );
      const eligibleTotal = stuRes.data?.pagination?.total ?? 0;
      setGenEligibleCount(eligibleTotal);

      // Count already-generated invoices for this month/year
      const feeRes = await api.get<ApiListResponse<{ _id: string }>>(
        `/student-fees?sessionId=${target.sessionId}&classId=${target.classId}&feeType=monthly_tuition&month=${m}&limit=1`
      );
      setGenExistingCount(feeRes.data?.pagination?.total ?? 0);
    } catch {
      setGenEligibleCount(null);
      setGenExistingCount(null);
    } finally {
      setGenCheckLoading(false);
    }
  }, []);

  async function handleBatchGenerate() {
    if (!generateTarget) return;
    setGenBusy(true);
    try {
      const payload = {
        sessionId: generateTarget.sessionId,
        classId: generateTarget.classId,
        feeStructureId: generateTarget._id,
        month: genMonth,
        year: genYear,
      };

      const res = await api.post<{ success: boolean; data: { created: number; skipped: number } }>(
        '/student-fees/generate',
        payload
      );

      const { created, skipped } = res.data.data;
      toast.success(
        `Generated ${created} invoices successfully! (${skipped} already existing were skipped)`,
        { duration: 5000 }
      );
      setGenerateTarget(null);
    } catch (err: any) {
      toast.error(apiErrorMessage(err));
    } finally {
      setGenBusy(false);
    }
  }

  async function toggleArchive(row: FeeRow) {
    try {
      if (row.isArchived) {
        await api.post(`/fee-structures/${row._id}/restore`);
        toast.success('Fee structure restored');
      } else {
        await api.post(`/fee-structures/${row._id}/archive`);
        toast.success('Fee structure archived');
      }
      setArchiveTarget(null);
      loadStructures();
    } catch (err: any) {
      toast.error(apiErrorMessage(err));
    }
  }

  const columns: Column<FeeRow>[] = [
    {
      key: 'title',
      header: 'Structure Title',
      cell: (row) => (
        <div className="leading-tight">
          <p className="font-semibold text-foreground">{row.title}</p>
          <p className="text-xs text-muted-foreground">{FEE_TYPES[row.feeType] ?? row.feeType}</p>
        </div>
      ),
    },
    {
      key: 'class',
      header: 'Class / Session',
      cell: (row) => (
        <div className="leading-tight">
          <p className="font-medium text-foreground">{row.className || 'Class'}</p>
          <p className="text-[11px] text-muted-foreground">{row.sessionName || 'Session'}</p>
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Base Amount',
      cell: (row) => (
        <span className="font-bold text-foreground">{formatCurrency(row.amount)}</span>
      ),
    },
    {
      key: 'month',
      header: 'Month / Schedule',
      cell: (row) => (
        <span className="text-xs text-muted-foreground">
          {row.feeType === 'monthly_tuition' && row.month
            ? MONTHS[row.month - 1]
            : row.feeType === 'admission_fee'
              ? 'One-Time / Admission'
              : 'As Scheduled'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (row) => (
        <Badge
          variant={row.isArchived ? 'outline' : row.isActive ? 'default' : 'secondary'}
          className={
            row.isArchived
              ? 'border-rose-300 text-rose-600 bg-rose-50 dark:bg-rose-950/40 text-[10px]'
              : row.isActive
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 text-[10px]'
                : 'text-[10px]'
          }
        >
          {row.isArchived ? 'Archived' : row.isActive ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      className: 'text-right',
      headerClassName: 'text-right',
      cell: (row) => (
        <div className="flex items-center justify-end gap-1.5">
          {row.feeType === 'monthly_tuition' && !row.isArchived && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const m = row.month || new Date().getMonth() + 1;
                const y = new Date().getFullYear();
                setGenerateTarget(row);
                setGenMonth(m);
                setGenYear(y);
                setGenEligibleCount(null);
                setGenExistingCount(null);
                loadGenPreCheck(row, m, y);
              }}
              className="h-8 gap-1 text-xs border-primary/40 text-primary hover:bg-primary/5"
            >
              <Sparkles className="h-3.5 w-3.5 text-amber-500" />
              Generate Monthly Fees
            </Button>
          )}

          {canEdit && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => openEdit(row)}
              className="h-8 w-8 p-0"
              title="Edit structure"
            >
              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          )}

          {canEdit && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setArchiveTarget(row)}
              className="h-8 w-8 p-0 text-muted-foreground hover:text-rose-600"
              title={row.isArchived ? 'Restore structure' : 'Archive structure'}
            >
              {row.isArchived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Fee Setup & Structures"
        description="Configure class tuition fees, admission fee structures, and trigger idempotent monthly invoice generation"
        actions={
          canCreate && (
            <Button
              onClick={openCreate}
              size="sm"
              className="h-9 gap-1.5 bg-primary text-primary-foreground shadow-sm hover:opacity-95"
            >
              <Plus className="h-4 w-4" />
              New Fee Structure
            </Button>
          )
        }
      />

      <FeesNavHeader activeTab="setup" />

      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center gap-3 p-3.5 rounded-2xl bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm border border-border/70 shadow-xs">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          <Filter className="h-3.5 w-3.5 text-primary" />
          <span>Filters:</span>
        </div>

        {sessions.length > 0 && (
          <Select value={sessionId} onValueChange={setSessionId}>
            <SelectTrigger className="w-44 h-8 text-xs bg-background">
              <SelectValue placeholder="All Sessions" />
            </SelectTrigger>
            <SelectContent>
              {sessions.map((ses) => (
                <SelectItem key={ses._id} value={ses._id}>
                  {ses.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select value={classId} onValueChange={setClassId}>
          <SelectTrigger className="w-40 h-8 text-xs bg-background">
            <SelectValue placeholder="All Classes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Classes</SelectItem>
            {classes.map((cls) => (
              <SelectItem key={cls._id} value={cls._id}>
                {cls.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={feeType} onValueChange={setFeeType}>
          <SelectTrigger className="w-40 h-8 text-xs bg-background">
            <SelectValue placeholder="All Fee Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Fee Types</SelectItem>
            <SelectItem value="monthly_tuition">Monthly Tuition</SelectItem>
            <SelectItem value="admission_fee">Admission Fee</SelectItem>
            <SelectItem value="other">Other Fee</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Structures Table */}
      <DataTable
        columns={columns}
        data={data}
        loading={loading}
        rowKey={(r) => r._id}
        pagination={pagination}
        onPageChange={(page) => setPagination((prev) => ({ ...prev, page }))}
        emptyTitle="No fee structures found. Click 'New Fee Structure' to create one."
      />

      {/* Create / Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-md">
          <form onSubmit={handleSaveStructure} className="space-y-4">
            <DialogHeader>
              <DialogTitle className="text-base font-bold">
                {editing ? 'Edit Base Amount' : 'Create New Fee Structure'}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                {editing
                  ? 'Update the base amount for this fee structure.'
                  : 'Define the monthly base amount per class. You can add multiple classes at once.'}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Academic Session</Label>
                  <Select value={formSessionId} onValueChange={setFormSessionId} disabled={!!editing}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Session" />
                    </SelectTrigger>
                    <SelectContent>
                      {sessions.map((s) => (
                        <SelectItem key={s._id} value={s._id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Fee Type</Label>
                  <Select value={formFeeType} onValueChange={setFormFeeType} disabled={!!editing}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly_tuition">Monthly Tuition</SelectItem>
                      <SelectItem value="admission_fee">Admission Fee</SelectItem>
                      <SelectItem value="other">Other Fee</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Structure Title</Label>
                <Input
                  required
                  placeholder="e.g. Grade 7 Monthly Tuition"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>

              {formFeeType === 'monthly_tuition' && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Default Month (Optional)</Label>
                  <Select
                    value={formMonth ? String(formMonth) : 'none'}
                    onValueChange={(v) => setFormMonth(v === 'none' ? null : Number(v))}
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Any Month / Flexible" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Any Month (Flexible)</SelectItem>
                      {MONTHS.map((m, idx) => (
                        <SelectItem key={m} value={String(idx + 1)}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Effective From Month (Optional)</Label>
                  <Select
                    value={formEffectiveFromMonth ? String(formEffectiveFromMonth) : 'none'}
                    onValueChange={(v) => setFormEffectiveFromMonth(v === 'none' ? null : Number(v))}
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="No restriction" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No restriction</SelectItem>
                      {MONTHS.map((m, idx) => (
                        <SelectItem key={m} value={String(idx + 1)}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Effective From Year (Optional)</Label>
                  <Input
                    type="number"
                    min="2000"
                    placeholder="e.g. 2026"
                    value={formEffectiveFromYear || ''}
                    onChange={(e) => setFormEffectiveFromYear(e.target.value ? Number(e.target.value) : null)}
                    className="h-9 text-xs"
                  />
                </div>
              </div>

              {hasDueDate && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Specific Due Date (Optional)</Label>
                  <Input
                    type="date"
                    value={formDueDate}
                    onChange={(e) => setFormDueDate(e.target.value)}
                    className="h-9 text-xs"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    If left blank, the default due day ({defaultDueDay}th of month) will be applied.
                  </p>
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="text-xs">Notes / Description (Optional)</Label>
                <Textarea
                  placeholder="Optional details about this fee structure..."
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  className="text-xs h-20 resize-none"
                />
              </div>

              <div className="space-y-2 mt-2">
                <Label className="text-xs">Class Base Amounts</Label>
                <div className="border rounded-md overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-muted">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Class</th>
                        <th className="px-3 py-2 text-left font-medium">Base Amount (PKR)</th>
                        {!editing && <th className="px-3 py-2 w-10"></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {formRows.map((row, idx) => (
                        <tr key={idx} className="border-t">
                          <td className="p-2">
                            <Select
                              value={row.classId}
                              onValueChange={(v) => {
                                const newRows = [...formRows];
                                newRows[idx].classId = v;
                                setFormRows(newRows);
                              }}
                              disabled={!!editing}
                            >
                              <SelectTrigger className="h-8 text-xs border-transparent bg-transparent hover:bg-muted/50 focus:ring-0 px-2">
                                <SelectValue placeholder="Select Class" />
                              </SelectTrigger>
                              <SelectContent>
                                {classes.map((c) => (
                                  <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="p-2">
                            <Input
                              type="number"
                              step="1"
                              min="1"
                              required
                              placeholder="e.g. 5000"
                              value={row.amountPkr}
                              onChange={(e) => {
                                const newRows = [...formRows];
                                newRows[idx].amountPkr = e.target.value;
                                setFormRows(newRows);
                              }}
                              className="h-8 text-xs border-transparent bg-transparent hover:bg-muted/50 focus-visible:ring-1 px-2"
                            />
                          </td>
                          {!editing && (
                            <td className="p-2 text-center">
                              {formRows.length > 1 && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 text-muted-foreground hover:text-rose-600"
                                  onClick={() => {
                                    const newRows = [...formRows];
                                    newRows.splice(idx, 1);
                                    setFormRows(newRows);
                                  }}
                                >
                                  &times;
                                </Button>
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!editing && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs text-primary hover:text-primary/80 mt-1"
                    onClick={() => {
                      setFormRows([...formRows, { classId: '', amountPkr: '' }]);
                    }}
                  >
                    <Plus className="h-3 w-3 mr-1" /> Add Another Class
                  </Button>
                )}
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setFormOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={busy} className="gap-1.5">
                {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {editing ? 'Save Changes' : 'Save Fee Structure'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Batch Generate Modal */}
      <Dialog open={!!generateTarget} onOpenChange={(open) => !open && setGenerateTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-500" />
              Generate Monthly Fees
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Generate monthly tuition invoices for all enrolled students in{' '}
              <span className="font-semibold text-foreground">{generateTarget?.className}</span>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-3 text-xs">
            <div className="p-3 rounded-xl bg-muted/60 border border-border/70 space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Academic Session:</span>
                <span className="font-semibold text-foreground">{generateTarget?.sessionName || sessions.find(s => s._id === generateTarget?.sessionId)?.name || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Class:</span>
                <span className="font-semibold text-foreground">{generateTarget?.className || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Monthly Tuition:</span>
                <span className="font-bold text-foreground">{formatCurrency(generateTarget?.amount ?? 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Eligible Students:</span>
                <span className="font-medium text-foreground">
                  {genCheckLoading ? <Loader2 className="h-3 w-3 animate-spin inline" /> : genEligibleCount !== null ? genEligibleCount : '—'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Already Generated:</span>
                <span className={`font-medium ${(genExistingCount ?? 0) > 0 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                  {genCheckLoading ? <Loader2 className="h-3 w-3 animate-spin inline" /> : genExistingCount !== null ? `${genExistingCount} invoices` : '—'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Duplicate Protection:</span>
                <span className="text-emerald-600 font-medium flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Idempotent
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="space-y-1.5">
                <Label className="text-xs">Billing Month</Label>
                <Select value={String(genMonth)} onValueChange={(v) => {
                  const m = Number(v);
                  setGenMonth(m);
                  if (generateTarget) loadGenPreCheck(generateTarget, m, genYear);
                }}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m, idx) => (
                      <SelectItem key={m} value={String(idx + 1)}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Billing Year</Label>
                <Input
                  type="number"
                  value={genYear}
                  onChange={(e) => {
                    const y = Number(e.target.value);
                    setGenYear(y);
                    if (generateTarget && y > 2000) loadGenPreCheck(generateTarget, genMonth, y);
                  }}
                  className="h-9 text-xs"
                />
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground leading-relaxed pt-1">
              • Each invoice takes an immutable snapshot of discounts, other fees, and due date at generation time.
              <br />
              • Students who already have an invoice for {MONTHS[genMonth - 1]} {genYear} will be safely skipped.
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setGenerateTarget(null)}
              disabled={genBusy}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleBatchGenerate}
              disabled={genBusy}
              className="gap-1.5 bg-gradient-to-r from-[#1E3A8A] to-[#2563EB] text-white"
            >
              {genBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 text-amber-300" />}
              Generate Monthly Fees
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Archive / Restore Confirmation */}
      <ConfirmDialog
        open={!!archiveTarget}
        onOpenChange={(open) => !open && setArchiveTarget(null)}
        title={archiveTarget?.isArchived ? 'Restore Fee Structure?' : 'Archive Fee Structure?'}
        description={
          archiveTarget?.isArchived
            ? `Are you sure you want to restore "${archiveTarget?.title}"? It will become active again.`
            : `Are you sure you want to archive "${archiveTarget?.title}"? It will no longer be available for invoice generation.`
        }
        confirmLabel={archiveTarget?.isArchived ? 'Restore' : 'Archive'}
        destructive={!archiveTarget?.isArchived}
        onConfirm={() => {
          if (archiveTarget) toggleArchive(archiveTarget);
        }}
      />
    </div>
  );
}
}
