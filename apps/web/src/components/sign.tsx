'use client';

import { useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Btn, ErrorBox, Field, Modal, Textarea } from './ui';

/**
 * Electronic signature dialog: the signer re-enters their password (Part 11-style signature
 * manifestation). The password goes only to the API call that performs the signed action.
 */
export function SignDialog({
  title,
  meaning,
  onSign,
  onClose,
  commentLabel,
  commentRequired,
  confirmLabel = 'Sign',
  children,
}: {
  title: string;
  meaning: string;
  onSign: (password: string, comment: string) => Promise<unknown>;
  onClose: () => void;
  commentLabel?: string;
  commentRequired?: boolean;
  confirmLabel?: string;
  children?: ReactNode;
}) {
  const qc = useQueryClient();
  const [password, setPassword] = useState('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSign(password, comment);
      for (const k of ['history', 'dashboard', 'notifications']) qc.invalidateQueries({ queryKey: [k] });
      onClose();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn kind="pri" loading={busy} disabled={!password || (commentRequired && !comment.trim())} onClick={submit}>
            {confirmLabel}
          </Btn>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="grid"
      >
        {children}
        {commentLabel && (
          <Field label={commentLabel} required={commentRequired}>
            <Textarea value={comment} onChange={(e) => setComment(e.target.value)} />
          </Field>
        )}
        <div className="alert info small">{meaning} Your electronic signature, with date and time, is recorded in the audit trail.</div>
        <Field label="Password" required>
          <input type="password" autoComplete="current-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <ErrorBox error={error} />
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
