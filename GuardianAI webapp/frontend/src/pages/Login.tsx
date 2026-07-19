import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Eye, EyeOff, Lock, User as UserIcon, AlertCircle } from 'lucide-react';

export const Login: React.FC = () => {
  const [emailOrId, setEmailOrId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [forgotFlow, setForgotFlow] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  
  // UI states
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailOrId || !password) {
      setError('Please enter both employee credentials and password.');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const result = await login(emailOrId, password);
      if (result.success) {
        setSuccess(true);
        setTimeout(() => {
          navigate('/');
        }, 1200);
      } else {
        setError(result.error || 'Invalid credentials. Please verify your details.');
      }
    } catch (err) {
      setError('Connection to security gateway failed. Please verify configurations.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail) return;
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      alert(`Safety instruction link sent to ${forgotEmail}`);
      setForgotFlow(false);
    }, 1000);
  };

  return (
    <div className="relative min-h-screen bg-cyber-bg overflow-hidden flex items-center justify-center font-inter px-4">
      {/* Background Cyber Grid */}
      <div 
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `
            radial-gradient(circle at 1px 1px, #FFD400 1px, transparent 0),
            linear-gradient(to right, rgba(255, 212, 0, 0.1) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255, 212, 0, 0.1) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px, 20px 20px, 20px 20px'
        }}
      ></div>

      {/* Cybernetic Accent Glows */}
      <div className="absolute top-1/4 left-1/4 w-[30rem] h-[30rem] bg-cyber-yellow/10 rounded-full blur-[100px] pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-[30rem] h-[30rem] bg-red-500/5 rounded-full blur-[100px] pointer-events-none"></div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="w-full max-w-md"
      >
        <div className={`cyber-card p-8 rounded-2xl border ${error ? 'border-red-500/40 shadow-glow-danger' : 'border-cyber-border'} relative overflow-hidden bg-cyber-card/85`}>
          
          {/* Top Status Bar indicator */}
          <div className={`absolute top-0 left-0 w-full h-[3px] ${
            success ? 'bg-green-500 shadow-[0_0_10px_#22C55E]' :
            error ? 'bg-red-500 shadow-[0_0_10px_#EF4444]' :
            loading ? 'bg-cyber-yellow animate-pulse shadow-glow-yellow' : 'bg-cyber-border'
          }`}></div>

          {/* Logo & Header */}
          <div className="flex flex-col items-center mb-8">
            <div className="bg-cyber-yellow text-black p-3 rounded-2xl flex items-center justify-center mb-4 shadow-glow-yellow">
              <Shield className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-bold font-outfit uppercase tracking-widest text-white">
              GUARDIAN<span className="text-cyber-yellow">AI</span>
            </h1>
            <p className="text-xs text-slate-400 mt-1">Smart Industrial Health & Safety Portal</p>
          </div>

          <AnimatePresence mode="wait">
            {!forgotFlow ? (
              <motion.form
                key="login-form"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                onSubmit={handleSubmit}
                className="space-y-5"
              >
                {/* Error Banner */}
                {error && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="flex items-center space-x-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-xs"
                  >
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{error}</span>
                  </motion.div>
                )}

                {/* Input 1: Email or Employee ID */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300 uppercase tracking-wide">
                    Employee ID or Email
                  </label>
                  <div className="relative">
                    <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      required
                      placeholder="e.g. EMP-1001 or admin@guardian.ai"
                      value={emailOrId}
                      onChange={(e) => setEmailOrId(e.target.value)}
                      disabled={loading || success}
                      className="w-full bg-cyber-darker border border-cyber-border rounded-lg pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyber-yellow transition-all duration-200"
                    />
                  </div>
                </div>

                {/* Input 2: Password */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-semibold text-slate-300 uppercase tracking-wide">
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => setForgotFlow(true)}
                      className="text-xs text-cyber-yellow hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={loading || success}
                      className="w-full bg-cyber-darker border border-cyber-border rounded-lg pl-10 pr-10 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyber-yellow transition-all duration-200"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Remember Me */}
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="remember"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded border-cyber-border bg-cyber-darker text-cyber-yellow focus:ring-0 focus:ring-offset-0"
                  />
                  <label htmlFor="remember" className="ml-2 text-xs text-slate-400 cursor-pointer select-none">
                    Remember my terminal session
                  </label>
                </div>

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={loading || success}
                  className={`w-full py-3 px-4 rounded-lg font-outfit font-semibold text-sm transition-all duration-300 flex items-center justify-center space-x-2 ${
                    success
                      ? 'bg-green-500 text-white shadow-[0_0_15px_rgba(34,197,94,0.4)]'
                      : 'bg-cyber-yellow hover:bg-yellow-400 text-black hover:shadow-glow-yellow'
                  }`}
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
                  ) : success ? (
                    <span>AUTHORIZED Access</span>
                  ) : (
                    <span>INITIATE GATEWAY ACCESS</span>
                  )}
                </button>
              </motion.form>
            ) : (
              <motion.form
                key="forgot-form"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                onSubmit={handleForgotSubmit}
                className="space-y-5"
              >
                <div className="text-center">
                  <h3 className="text-sm font-semibold text-white uppercase tracking-wide">Reset Operations Key</h3>
                  <p className="text-xs text-slate-400 mt-1">Enter your registered email address to receive password reset tokens.</p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300 uppercase tracking-wide">
                    Email Address
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="supervisor@company.com"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    className="w-full bg-cyber-darker border border-cyber-border rounded-lg px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyber-yellow transition-all duration-200"
                  />
                </div>

                <div className="flex items-center justify-between space-x-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setForgotFlow(false)}
                    className="flex-1 py-2.5 border border-cyber-border rounded-lg text-xs font-semibold text-slate-300 hover:bg-slate-800 transition-all duration-200"
                  >
                    Back to Login
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 py-2.5 bg-cyber-yellow text-black hover:bg-yellow-400 rounded-lg text-xs font-semibold transition-all duration-200"
                  >
                    {loading ? 'Sending...' : 'Send Recovery Token'}
                  </button>
                </div>
              </motion.form>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
};
