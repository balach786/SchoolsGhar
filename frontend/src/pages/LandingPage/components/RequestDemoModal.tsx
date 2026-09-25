import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle2, School, User, Mail, Phone, Users, ShieldCheck, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/sonner';

interface RequestDemoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function RequestDemoModal({ isOpen, onClose }: RequestDemoModalProps) {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    schoolName: '',
    contactName: '',
    email: '',
    phone: '',
    studentCount: '500-1000',
    role: 'Principal / Administrator',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setSubmitted(true);
      toast.success('Demo request received! Our education specialist will contact you within 24 hours.');
    }, 900);
  };

  const handleResetAndClose = () => {
    onClose();
    setTimeout(() => {
      setSubmitted(false);
      setFormData({
        schoolName: '',
        contactName: '',
        email: '',
        phone: '',
        studentCount: '500-1000',
        role: 'Principal / Administrator',
      });
    }, 300);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleResetAndClose}
            className="fixed inset-0 bg-black/80 backdrop-blur-md"
          />

          {/* Modal Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', duration: 0.5, bounce: 0.2 }}
            className="relative w-full max-w-lg rounded-2xl border border-white/10 bg-[#131722] p-6 sm:p-8 shadow-2xl shadow-indigo-950/40 z-10 overflow-hidden"
          >
            {/* Ambient Corner Glow */}
            <div className="pointer-events-none absolute -top-24 -right-24 h-48 w-48 rounded-full bg-indigo-500/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 -left-24 h-48 w-48 rounded-full bg-purple-500/20 blur-3xl" />

            {/* Close Button */}
            <button
              onClick={handleResetAndClose}
              className="absolute top-5 right-5 rounded-full p-2 text-[#77809A] transition-colors hover:bg-white/5 hover:text-white"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>

            {!submitted ? (
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-indigo-400">
                  <Sparkles className="h-4 w-4" />
                  <span>Personalized Walkthrough</span>
                </div>
                <h3 className="mt-2 text-2xl font-bold tracking-tight text-[#F7F8FC]">
                  Request an Executive Demo
                </h3>
                <p className="mt-1.5 text-sm text-[#A7AEC1]">
                  Experience how the School Management System streamlines academics, finance, and administration for your institution.
                </p>

                <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                  <div>
                    <Label className="text-xs font-medium text-[#A7AEC1]">School / Institution Name</Label>
                    <div className="relative mt-1">
                      <School className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#77809A]" />
                      <Input
                        required
                        placeholder="e.g. Al-Huda Grammar School"
                        value={formData.schoolName}
                        onChange={(e) => setFormData({ ...formData, schoolName: e.target.value })}
                        className="border-white/10 bg-[#171B27] pl-9 text-[#F7F8FC] placeholder:text-[#77809A] focus-visible:border-indigo-500 focus-visible:ring-indigo-500/20"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <Label className="text-xs font-medium text-[#A7AEC1]">Contact Person</Label>
                      <div className="relative mt-1">
                        <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#77809A]" />
                        <Input
                          required
                          placeholder="Dr. Tariq Ahmed"
                          value={formData.contactName}
                          onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                          className="border-white/10 bg-[#171B27] pl-9 text-[#F7F8FC] placeholder:text-[#77809A] focus-visible:border-indigo-500"
                        />
                      </div>
                    </div>

                    <div>
                      <Label className="text-xs font-medium text-[#A7AEC1]">Your Role</Label>
                      <select
                        value={formData.role}
                        onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                        className="mt-1 w-full rounded-md border border-white/10 bg-[#171B27] px-3 py-2 text-sm text-[#F7F8FC] focus:border-indigo-500 focus:outline-none"
                      >
                        <option value="Principal / Administrator">Principal / Admin</option>
                        <option value="School Trustee / Owner">School Trustee / Owner</option>
                        <option value="Academic Director">Academic Director</option>
                        <option value="Chief Accountant">Chief Accountant</option>
                        <option value="IT Coordinator">IT Coordinator</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <Label className="text-xs font-medium text-[#A7AEC1]">Official Email</Label>
                      <div className="relative mt-1">
                        <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#77809A]" />
                        <Input
                          type="email"
                          required
                          placeholder="admin@school.edu"
                          value={formData.email}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                          className="border-white/10 bg-[#171B27] pl-9 text-[#F7F8FC] placeholder:text-[#77809A] focus-visible:border-indigo-500"
                        />
                      </div>
                    </div>

                    <div>
                      <Label className="text-xs font-medium text-[#A7AEC1]">Phone Number</Label>
                      <div className="relative mt-1">
                        <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#77809A]" />
                        <Input
                          type="tel"
                          required
                          placeholder="+92 300 1234567"
                          value={formData.phone}
                          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                          className="border-white/10 bg-[#171B27] pl-9 text-[#F7F8FC] placeholder:text-[#77809A] focus-visible:border-indigo-500"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs font-medium text-[#A7AEC1]">Total Student Capacity</Label>
                    <div className="relative mt-1">
                      <Users className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#77809A]" />
                      <select
                        value={formData.studentCount}
                        onChange={(e) => setFormData({ ...formData, studentCount: e.target.value })}
                        className="w-full rounded-md border border-white/10 bg-[#171B27] pl-9 pr-3 py-2 text-sm text-[#F7F8FC] focus:border-indigo-500 focus:outline-none"
                      >
                        <option value="100-500">100 – 500 Students</option>
                        <option value="500-1000">500 – 1,000 Students</option>
                        <option value="1000-2500">1,000 – 2,500 Students</option>
                        <option value="2500+">2,500+ Students (Multi-Branch)</option>
                      </select>
                    </div>
                  </div>

                  <div className="pt-2">
                    <Button
                      type="submit"
                      disabled={loading}
                      className="w-full h-11 bg-gradient-to-r from-[#4F46E5] via-[#6558F5] to-[#7467FF] text-white font-semibold shadow-lg shadow-indigo-600/30 hover:opacity-95 transition-all"
                    >
                      {loading ? 'Submitting Request...' : 'Schedule Live Demonstration'}
                    </Button>
                    <p className="mt-2.5 text-center text-[11px] text-[#77809A]">
                      No credit card required · Free consultative system tour tailored to your curriculum.
                    </p>
                  </div>
                </form>
              </div>
            ) : (
              <div className="py-8 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400">
                  <CheckCircle2 className="h-8 w-8" />
                </div>
                <h4 className="mt-4 text-xl font-bold text-[#F7F8FC]">Request Confirmed!</h4>
                <p className="mt-2 text-sm text-[#A7AEC1]">
                  Thank you, <span className="text-white font-medium">{formData.contactName}</span>. A dedicated education specialist will reach out to schedule your personalized live demo of the <span className="text-indigo-400 font-medium">School Management System</span>.
                </p>
                <div className="mt-6 flex justify-center">
                  <Button
                    onClick={handleResetAndClose}
                    className="bg-[#171B27] border border-white/10 text-white hover:bg-[#1B1F2C]"
                  >
                    Return to Homepage
                  </Button>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
