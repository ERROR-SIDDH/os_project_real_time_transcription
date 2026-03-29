import { NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import sseEmitter from '@/lib/events';
import type { Message } from '@/types';

const DB_NAME = process.env.DB_NAME || 'echovault';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { room_id, message, speaker, full_transcript } = body;

    if (!room_id || typeof room_id !== 'string' || !/^\d{6}$/.test(room_id)) {
      return NextResponse.json({ error: 'Invalid room_id provided. Must be a 6-digit string.' }, { status: 400 });
    }

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Invalid message provided.' }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db(DB_NAME);
    const collection = db.collection(room_id);

    // This ensures the collection is created if it doesn't exist
    await collection.createIndex({ createdAt: 1 });

    const newMessage: Omit<Message, '_id'> = {
      message: message,
      speaker: speaker,
      full_transcript: full_transcript,
      createdAt: new Date(),
    };

    const result = await collection.insertOne(newMessage);

    const insertedMessage: Message = {
      _id: result.insertedId,
      ...newMessage,
    };

    // Notify listeners for this room
    sseEmitter.emit(`message:${room_id}`, JSON.stringify(insertedMessage));

    return NextResponse.json({ success: true, message: 'Message saved.' }, { status: 201 });

  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
