import { useEffect, useState } from 'react';

import { Button } from '../../components/ui/Button';
import { GlassCard } from '../../components/ui/GlassCard';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { apiFetch } from '../../utils/api';
import { getProfileIconSrc, PROFILE_AVATAR_IDS } from '../../utils/profileIcons';
import { useAuth } from '../auth/AuthContext';

export function ProfilePage() {
  const { account, updateProfile } = useAuth();
  const profile = account.profile;
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [avatarId, setAvatarId] = useState(1);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordStatus, setPasswordStatus] = useState<{
    type: 'ok' | 'err';
    message: string;
  } | null>(null);
  const [passwordSaving, setPasswordSaving] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.displayName);
    setEmail(profile.email);
    setAvatarId(profile.avatarId);
  }, [profile]);

  if (!profile) {
    return (
      <div className="mx-auto max-w-4xl">
        <GlassCard className="p-6">
          <p className="text-muted text-sm">Unable to load profile data.</p>
        </GlassCard>
      </div>
    );
  }

  const handleSave = () => {
    updateProfile({
      displayName: displayName.trim() || profile.username,
      email: email.trim(),
      avatarId,
    });
    setSaveStatus('Profile saved.');
  };

  const handleChangePassword = async () => {
    const current = currentPassword;
    const next = newPassword;
    const confirm = confirmPassword;
    if (!current || !next) {
      setPasswordStatus({
        type: 'err',
        message: 'Current password and new password are required.',
      });
      return;
    }
    if (next.length < 8) {
      setPasswordStatus({
        type: 'err',
        message: 'New password must be at least 8 characters.',
      });
      return;
    }
    if (next !== confirm) {
      setPasswordStatus({ type: 'err', message: 'Passwords do not match.' });
      return;
    }

    setPasswordSaving(true);
    try {
      const response = await apiFetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({
          current_password: current,
          new_password: next,
        }),
      });
      const body = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok) {
        setPasswordStatus({
          type: 'err',
          message: body?.error || 'Failed to change password.',
        });
        return;
      }
      setPasswordStatus({ type: 'ok', message: 'Password updated.' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch {
      setPasswordStatus({
        type: 'err',
        message: 'Failed to change password.',
      });
    } finally {
      setPasswordSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <GlassCard className="p-6">
        <h1 className="text-foreground text-2xl font-semibold">Profile</h1>
        <p className="text-muted mt-1 text-sm">Manage your user settings for this application.</p>
      </GlassCard>

      <GlassCard className="p-6">
        <h2 className="text-foreground mb-3 text-lg font-semibold">Profile Icon</h2>
        <div className="profile-icon-grid">
          {PROFILE_AVATAR_IDS.map((id) => (
            <button
              key={id}
              type="button"
              className={`profile-icon-option ${avatarId === id ? 'profile-icon-option--selected' : ''}`}
              onClick={() => {
                setAvatarId(id);
                setSaveStatus(null);
              }}
              aria-label={`Select profile icon ${id}`}
            >
              <img src={getProfileIconSrc(id)} alt="" className="profile-icon-option__image" />
            </button>
          ))}
        </div>
      </GlassCard>

      <GlassCard className="p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-muted mb-1.5 block text-sm">Username</label>
            <Input type="text" readOnlyStyle value={profile.username} readOnly />
          </div>
          <div>
            <label className="text-muted mb-1.5 block text-sm">Profile</label>
            <Input type="text" readOnlyStyle value={profile.isAdmin ? 'Admin' : 'User'} readOnly />
          </div>
          <div>
            <label className="text-muted mb-1.5 block text-sm">Name</label>
            <Input
              type="text"
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value);
                setSaveStatus(null);
              }}
              placeholder="Display name"
            />
          </div>
          <div>
            <label className="text-muted mb-1.5 block text-sm">Email</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setSaveStatus(null);
              }}
              placeholder="you@example.com"
            />
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setShowChangePassword(true);
              setPasswordStatus(null);
            }}
          >
            Change Password
          </Button>
          <Button type="button" variant="accent" onClick={handleSave}>
            Save
          </Button>
        </div>
        {saveStatus && <p className="text-success mt-3 text-sm">{saveStatus}</p>}
      </GlassCard>

      <Modal
        open={showChangePassword}
        className="glass-modal-surface max-w-md"
        onClose={() => {
          setShowChangePassword(false);
          setPasswordStatus(null);
        }}
      >
        <h3 className="text-foreground mb-3 text-lg font-semibold">Change Password</h3>
        <div className="space-y-3">
          <Input
            type="password"
            placeholder="Current password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
          <Input
            type="password"
            placeholder="New password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <Input
            type="password"
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </div>
        {passwordStatus && (
          <p
            className={`mt-3 text-sm ${
              passwordStatus.type === 'ok' ? 'text-success' : 'text-danger'
            }`}
          >
            {passwordStatus.message}
          </p>
        )}
        <div className="modal-actions">
          <Button
            type="button"
            variant="cancel"
            onClick={() => {
              setShowChangePassword(false);
              setPasswordStatus(null);
            }}
          >
            Close
          </Button>
          <Button
            type="button"
            variant="accent"
            onClick={handleChangePassword}
            disabled={passwordSaving}
          >
            {passwordSaving ? 'Saving...' : 'Update Password'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
