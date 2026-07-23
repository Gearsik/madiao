function Pile({ pile = { count: 0 } }) {
    return (
        <div className="pile">
            <div className="pile-count">{pile.count}</div>
            <div className="pile-label">Pile</div>
        </div>
    );
}
export default Pile;