import type { ObjectId } from 'mongodb';

export interface Message {
  _id: ObjectId;
  message: string;
  speaker?: string;
  full_transcript?: string[];
  createdAt: Date;
}
