"use client";

import PageBootstrap from "@components/PageBootstrap";
import LoadingState from "@components/UI/LoadingState";
import { ActivityTypes, RoleHeaders, StatusLabels, Urls } from "@constants";
import { Shield } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import type {
    Activity,
    LanyardIncomingMessage,
    LanyardUser,
    TeamResponse,
} from "@/types";
import { fetchTeam } from "@/utils";

async function fetchUsers(ids: string[]): Promise<Record<string, LanyardUser>> {
    const results = await Promise.all(
        ids.map(async id => {
            try {
                const res = await fetch(`${Urls.LANYARD_API}/users/${id}`);
                if (!res.ok) return null;

                const json = await res.json();
                return json.success ? [id, json.data as LanyardUser] : null;
            } catch {
                return null;
            }
        }),
    );

    const filtered = results.filter(Boolean) as [string, LanyardUser][];
    return Object.fromEntries(filtered);
}

function createLanyardSocket(
    ids: string[],
    onUpdate: (userId: string, user: LanyardUser) => void,
): WebSocket {
    const ws = new WebSocket(Urls.LANYARD_WS);
    let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

    ws.onmessage = event => {
        const message: LanyardIncomingMessage = JSON.parse(event.data);

        switch (message.op) {
            case 1:
                heartbeatInterval = setInterval(() => {
                    ws.send(JSON.stringify({ op: 3 }));
                }, message.d.heartbeat_interval);

                ws.send(
                    JSON.stringify({
                        op: 2,
                        d: { subscribe_to_ids: ids },
                    }),
                );
                break;

            case 0:
                if (message.t === "PRESENCE_UPDATE") {
                    const user = message.d;
                    if (user.discord_user?.id) {
                        onUpdate(user.discord_user.id, user);
                    }
                }
                break;
        }
    };

    ws.onclose = () => {
        if (heartbeatInterval) clearInterval(heartbeatInterval);
    };

    return ws;
}

function getActivityLabel(activity: Activity) {
    return ActivityTypes[activity.type] ?? "";
}

function UserCard({ userData }: { userData: LanyardUser }) {
    const u = userData.discord_user;

    const avatar = u.avatar
        ? u.avatar.startsWith("a_")
            ? `${Urls.DISCORD_CDN}/avatars/${u.id}/${u.avatar}.gif?size=128`
            : `${Urls.DISCORD_CDN}/avatars/${u.id}/${u.avatar}.webp?size=128`
        : `${Urls.DISCORD_CDN}/embed/avatars/0.png`;

    const decoration = u.avatar_decoration_data
        ? `${Urls.DISCORD_CDN}/avatar-decoration-presets/${u.avatar_decoration_data.asset}.png?size=128`
        : null;

    const customStatus = userData.activities.find(a => a.type === 4);
    const otherActivity = userData.activities.find(a => a.type !== 4);

    const username = u.global_name ?? u.username;
    const status =
        customStatus?.state ??
        StatusLabels[userData.discord_status] ??
        "Unknown";

    const statusColorClass =
        {
            online: "bg-green-500",
            idle: "bg-yellow-500",
            dnd: "bg-red-500",
            offline: "bg-gray-500",
        }[userData.discord_status] ?? "bg-gray-500";

    return (
        <div className="group relative overflow-hidden rounded-xl border border-neutral-800 bg-linear-to-br from-neutral-900 to-neutral-950 p-6">
            <div className="relative z-10 flex flex-col items-center text-center">
                <div className="relative mb-4">
                    <div className="relative">
                        {decoration && (
                            <Image
                                src={decoration}
                                width={64}
                                height={64}
                                draggable={false}
                                className="absolute inset-0 z-10 size-16 object-fit select-none scale-115"
                                alt="decoration"
                                unoptimized
                            />
                        )}

                        <Image
                            src={avatar}
                            alt={`${username}'s avatar`}
                            width={64}
                            height={64}
                            draggable={false}
                            className="size-16 rounded-full border-2 border-neutral-700 select-none"
                            unoptimized
                        />

                        <div
                            className={`absolute -right-1 -bottom-1 z-20 h-5 w-5 rounded-full border-2 border-neutral-900 ${statusColorClass}`}
                            role="status"
                            aria-label={`Status: ${StatusLabels[userData.discord_status] || "Offline"}`}
                        />
                    </div>
                </div>

                <h3 className="text-lg font-semibold text-white">{username}</h3>

                <div className="mt-3 flex flex-col gap-1 text-center">
                    {customStatus?.state && (
                        <p className="text-sm font-medium text-neutral-300">
                            {customStatus.state}
                        </p>
                    )}

                    {otherActivity && (
                        <p className="text-xs text-neutral-400">
                            {getActivityLabel(otherActivity)}
                            {otherActivity.details ?? otherActivity.name}
                        </p>
                    )}

                    {!customStatus?.state && !otherActivity && (
                        <p className="text-sm text-neutral-400">{status}</p>
                    )}
                </div>
            </div>
        </div>
    );
}

function RoleSection({
    title,
    userIds,
    users,
    colorClass,
}: {
    title: string
    userIds: string[]
    users: Record<string, LanyardUser>
    colorClass: string
}) {
    const filteredUsers = userIds
        .map(id => users[id])
        .filter((u): u is LanyardUser => !!u);

    if (filteredUsers.length === 0) return null;

    return (
        <section className="flex flex-col gap-4">
            <h2 className={`text-xl font-bold ${colorClass}`}>{title}</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {userIds.map(
                    id =>
                        users[id] && <UserCard key={id} userData={users[id]} />,
                )}
            </div>
        </section>
    );
}

export default function Teams() {
    const [users, setUsers] = useState<Record<string, LanyardUser>>({});
    const [loading, setLoading] = useState(true);
    const [team, setTeam] = useState<TeamResponse | null>(null);
    const wsRef = useRef<WebSocket | null>(null);

    useEffect(() => {
        (async () => {
            try {
                const teamData = await fetchTeam();
                setTeam(teamData);

                const allIds = [
                    ...teamData.owners,
                    ...teamData.team,
                    ...teamData.helpers,
                    ...teamData.artists,
                ];

                const data = await fetchUsers(allIds);
                setUsers(data);
                setLoading(false);

                wsRef.current = createLanyardSocket(allIds, (userId, user) => {
                    setUsers(prev => ({ ...prev, [userId]: user }));
                });
            } catch (err) {
                console.error("Failed to load team:", err);
                setLoading(false);
            }
        })();

        return () => {
            wsRef.current?.close();
        };
    }, []);

    return (
        <PageBootstrap
            meta={{ title: "Team" }}
            fullWidth
            icon={<Shield />}
            title="Meet the Team"
            description="The amazing people behind SudoCord"
        >
            <LoadingState loading={loading} loadingText="Loading team members">
                {team && (
                    <div className="flex flex-col gap-8">
                        <RoleSection
                            title="Owner"
                            userIds={team.owners}
                            users={users}
                            colorClass={RoleHeaders.owner}
                        />
                        <RoleSection
                            title="Team"
                            userIds={team.team}
                            users={users}
                            colorClass={RoleHeaders.team}
                        />
                        <RoleSection
                            title="Helpers"
                            userIds={team.helpers}
                            users={users}
                            colorClass={RoleHeaders.helper}
                        />
                        <RoleSection
                            title="Artists"
                            userIds={team.artists}
                            users={users}
                            colorClass={RoleHeaders.artist}
                        />
                    </div>
                )}
            </LoadingState>
        </PageBootstrap>
    );
}
