// What is and is not collected of a town's boards.
import { BOARD_STATUS, type Board, MINUTES_ONLINE } from "@/lib/docket";

export function Boards({ town, boards }: { town: string; boards: Board[] }) {
	return (
		<table className="boards">
			<caption>Boards of {town}</caption>
			<thead>
				<tr>
					<th scope="col">Board</th>
					<th scope="col">Collected</th>
					<th scope="col">Minutes</th>
				</tr>
			</thead>
			<tbody>
				{boards.map((board) => (
					<tr key={board.board}>
						<th scope="row">{board.board}</th>
						<td>{BOARD_STATUS[board.status]}</td>
						<td>
							{MINUTES_ONLINE[board.minutesOnline]}
							{board.note ? `. ${board.note}` : ""}
						</td>
					</tr>
				))}
			</tbody>
		</table>
	);
}
