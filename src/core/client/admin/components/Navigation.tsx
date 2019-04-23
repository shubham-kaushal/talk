import { Localized } from "fluent-react/compat";
import React, { StatelessComponent } from "react";

import { AppBarNavigation } from "talk-ui/components";

import NavigationLink from "./NavigationLink";

interface Props {
  showConfigure: boolean;
}

const Navigation: StatelessComponent<Props> = props => (
  <AppBarNavigation>
    <Localized id="navigation-moderate">
      <NavigationLink to="/admin/moderate">Moderate</NavigationLink>
    </Localized>
    <Localized id="navigation-stories">
      <NavigationLink to="/admin/stories">Stories</NavigationLink>
    </Localized>
    <Localized id="navigation-community">
      <NavigationLink to="/admin/community">Community</NavigationLink>
    </Localized>
    {props.showConfigure && (
      <Localized id="navigation-configure">
        <NavigationLink to="/admin/configure">Configure</NavigationLink>
      </Localized>
    )}
  </AppBarNavigation>
);

export default Navigation;