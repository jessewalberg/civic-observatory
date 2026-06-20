type PublicRecord = {
	_id: string;
	slug?: string | null;
};

export function municipalityPath(municipality: PublicRecord): string {
	return `/explore/${publicIdentifier(municipality)}`;
}

export function meetingPath(meeting: PublicRecord): string {
	return `/meeting/${publicIdentifier(meeting)}`;
}

export function publicIdentifier(record: PublicRecord): string {
	const slug = record.slug?.trim();
	return slug || record._id;
}
