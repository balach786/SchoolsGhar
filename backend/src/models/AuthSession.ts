import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * Refresh-token sessions.
 * Storage-efficient: only a hash of the token is stored (never the token
 * itself), and MongoDB's TTL index removes expired sessions automatically —
 * no session history accumulates.
 */
export interface IAuthSession extends Document {
  user: mongoose.Types.ObjectId;
  tokenHash: string;
  expiresAt: Date;
  revokedAt?: Date;
  createdAt: Date;
}

const authSessionSchema = new Schema<IAuthSession>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true, maxlength: 64 },
    expiresAt: { type: Date, required: true, index: { expires: 0 } }, // TTL index
    revokedAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false }
);

export const AuthSession: Model<IAuthSession> =
  mongoose.models.AuthSession || mongoose.model<IAuthSession>('AuthSession', authSessionSchema);
