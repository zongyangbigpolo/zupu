declare module 'relationship.js' {
  interface RelationshipOptions {
    text: string;
    target?: string;
    sex?: number;
    type?: 'default' | 'chain' | 'pair';
    reverse?: boolean;
    mode?: string;
    optimal?: boolean;
  }
  function relationship(options: RelationshipOptions): string[];
  export default relationship;
}
