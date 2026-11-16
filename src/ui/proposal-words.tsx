export function ProposalWords({ original, proposal }: { original: string; proposal: string }) {
  return <>
    {original && <del>{original}</del>}
    {original && proposal && ' → '}
    {proposal && <ins>{proposal}</ins>}
    {!original && !proposal && '(line break)'}
  </>
}
