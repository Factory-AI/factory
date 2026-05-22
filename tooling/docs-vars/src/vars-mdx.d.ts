declare module '*.mdx' {
  import type { ReactElement, ReactNode } from 'react';

  type GeneratedVars = typeof import('./vars').vars;
  type ProductVariant = keyof GeneratedVars['products'];
  type InstallPlatform = keyof GeneratedVars['install'];
  type GithubRepoKey = keyof GeneratedVars['urls']['github']['repo'];

  type LinkProps = {
    children?: ReactNode;
  };

  export const vars: GeneratedVars;

  export function ProductName(props: { variant: ProductVariant }): ReactElement;

  export function InstallCommand(props: {
    platform: InstallPlatform;
  }): ReactElement;

  export function SupportLink(props: LinkProps): ReactElement;

  export function SecurityLink(props: LinkProps): ReactElement;

  export function DiscordInvite(props: LinkProps): ReactElement;

  export function DocsURL(props: LinkProps & { path?: string }): ReactElement;

  export function GithubRepo(
    props: LinkProps & { repo: GithubRepoKey }
  ): ReactElement;
}
