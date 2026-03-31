import { NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import type { Message } from '@/types';

const DB_NAME = process.env.DB_NAME || 'echovault';

export async function GET(
    request: Request,
    { params }: { params: { roomId: string } }
) {
    const roomId = params.roomId;

    if (!/^\d{6}$/.test(roomId)) {
        return NextResponse.json({ error: 'Invalid room id' }, { status: 400 });
    }

    try {
        const client = await clientPromise;
        const db = client.db(DB_NAME);
        const collection = db.collection<Message>(roomId);

        const messages = await collection.find({}).sort({ createdAt: 1 }).toArray();

        return NextResponse.json({
            success: true,
            messages: messages
        });
    } catch (error) {
        console.error('Failed to fetch messages API:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
