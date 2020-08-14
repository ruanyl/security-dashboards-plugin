/*
 *   Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *   Licensed under the Apache License, Version 2.0 (the "License").
 *   You may not use this file except in compliance with the License.
 *   A copy of the License is located at
 *
 *       http://www.apache.org/licenses/LICENSE-2.0
 *
 *   or in the "license" file accompanying this file. This file is distributed
 *   on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either
 *   express or implied. See the License for the specific language governing
 *   permissions and limitations under the License.
 */

import React, { useEffect, useState } from 'react';
import { CoreStart } from 'kibana/public';
import {
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiModal,
  EuiModalBody,
  EuiModalFooter,
  EuiOverlayMask,
  EuiRadioGroup,
  EuiSpacer,
  EuiSuperSelect,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { keys } from 'lodash';
import { selectTenant } from '../configuration/utils/tenant-utils';
import { fetchAccountInfo } from './utils';
import { GENERIC_ERROR_INSTRUCTION } from '../apps-constants';

interface TenantSwitchPanelProps {
  coreStart: CoreStart;
  handleClose: () => void;
}

const GLOBAL_TENANT_KEY_NAME = 'global_tenant';
const GLOBAL_TENANT_RADIO_ID = 'global';
const PRIVATE_TENANT_RADIO_ID = 'private';
const CUSTOM_TENANT_RADIO_ID = 'custom';

export function TenantSwitchPanel(props: TenantSwitchPanelProps) {
  const [tenants, setTenants] = useState<string[]>([]);
  const [errorCallOut, setErrorCallOut] = useState<string>();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const tenantsInfo = (await fetchAccountInfo(props.coreStart.http)).data.tenants || {};
        setTenants(keys(tenantsInfo).filter((tenantName) => tenantsInfo[tenantName]));
      } catch (e) {
        // TODO: switch to better error display.
        console.error(e);
      }
    };

    fetchData();
  }, [props.coreStart.http]);

  // Custom tenant super select related.
  const [selectedCustomTenantOption, setSelectedCustomTenantOption] = useState<string>('');
  const onCustomTenantChange = (selectedOption: string) => {
    setSelectedCustomTenantOption(selectedOption);
    setErrorCallOut('');
  };
  const customTenantOptions = tenants.filter((tenant) => {
    return tenant !== GLOBAL_TENANT_KEY_NAME && tenant !== props.username;
  });

  const isMultiTenancyEnabled = props.config.multitenancy.enabled;
  const isGlobalEnabled = props.config.multitenancy.tenants.enable_global;
  const isPrivateEnabled = props.config.multitenancy.tenants.enable_private;

  const shouldDisableGlobal = !isGlobalEnabled || !tenants.includes(GLOBAL_TENANT_KEY_NAME);
  const getGlobalDisabledInstruction = () => {
    if (!isGlobalEnabled) {
      return 'Contact the administrator to enable global tenant.';
    }

    if (!tenants.includes(GLOBAL_TENANT_KEY_NAME)) {
      return 'Contact the administrator to get access to global tenant.';
    }
  };

  // The key for private tenant is the user name.
  const shouldDisablePrivate = !isPrivateEnabled || !tenants.includes(props.username);
  const getPrivateDisabledInstruction = () => {
    if (!isPrivateEnabled) {
      return 'Contact the administrator to enable private tenant.';
    }

    if (!tenants.includes(props.username)) {
      return 'Contact the administrator to get access to private tenant.';
    }
  };

  // Tenant switch radios related.
  const tenantSwitchRadios = [
    {
      id: GLOBAL_TENANT_RADIO_ID,
      label: (
        <>
          Global
          <EuiText size="s">The global tenant is shared between every Kibana user.</EuiText>
          {shouldDisableGlobal && <i>{getGlobalDisabledInstruction()}</i>}
          <EuiSpacer />
        </>
      ),
      disabled: shouldDisableGlobal,
    },
    {
      id: PRIVATE_TENANT_RADIO_ID,
      label: (
        <>
          Private
          <EuiText size="s">
            The private tenant is exclusive to each user and can&apos;t be shared. You might use the
            private tenant for exploratory work.
          </EuiText>
          {shouldDisablePrivate && <i>{getPrivateDisabledInstruction()}</i>}
          <EuiSpacer />
        </>
      ),
      disabled: shouldDisablePrivate,
    },
    {
      id: CUSTOM_TENANT_RADIO_ID,
      label: (
        <>
          Choose from custom
          <EuiSuperSelect
            options={customTenantOptions.map((option: string) => ({
              value: option,
              inputDisplay: option,
            }))}
            valueOfSelected={selectedCustomTenantOption}
            onChange={onCustomTenantChange}
            style={{ width: 400 }}
          />
        </>
      ),
      disabled: customTenantOptions.length === 0,
    },
  ];

  const [tenantSwitchRadioIdSelected, setTenantSwitchRadioIdSelected] = useState<string>();
  const onTenantSwitchRadioChange = (radioId: string) => {
    setTenantSwitchRadioIdSelected(radioId);
    setErrorCallOut('');
  };

  const changeTenant = async (tenantName: string) => {
    await selectTenant(props.coreStart.http, {
      tenant: tenantName,
      username: props.username,
    });
  };

  const handleTenantConfirmation = async function () {
    let tenantName;

    if (tenantSwitchRadioIdSelected === GLOBAL_TENANT_RADIO_ID) {
      tenantName = '';
    } else if (tenantSwitchRadioIdSelected === PRIVATE_TENANT_RADIO_ID) {
      tenantName = '__user__';
    } else if (tenantSwitchRadioIdSelected === CUSTOM_TENANT_RADIO_ID) {
      if (selectedCustomTenantOption) {
        tenantName = selectedCustomTenantOption;
      }
    }

    // check tenant name before calling backend
    if (tenantName === undefined) {
      setErrorCallOut('No target tenant is specified!');
    } else {
      try {
        await changeTenant(tenantName);
        props.handleClose();
      } catch (e) {
        if (e.body) {
          setErrorCallOut('Failed to switch tenant due to ' + e.body?.message);
        } else {
          setErrorCallOut('Failed to switch tenant. ' + GENERIC_ERROR_INSTRUCTION);
        }
      }
    }
  };

  let content;

  if (isMultiTenancyEnabled) {
    content = (
      <>
        <EuiRadioGroup
          options={tenantSwitchRadios}
          idSelected={tenantSwitchRadioIdSelected}
          onChange={(radioId) => onTenantSwitchRadioChange(radioId)}
          name="tenantSwitchRadios"
        />

        <EuiSpacer />

        {errorCallOut && (
          <EuiCallOut color="danger" iconType="alert">
            {errorCallOut}
          </EuiCallOut>
        )}
      </>
    );
  } else {
    content = <>Contact the administrator to enable multi tenancy.</>;
  }

  return (
    <EuiOverlayMask>
      <EuiModal onClose={props.handleClose}>
        <EuiSpacer />
        <EuiModalBody>
          <EuiTitle>
            <h4>Select your tenant</h4>
          </EuiTitle>

          <EuiSpacer />

          <EuiText size="s" color="subdued">
            Tenants are useful for safely sharing your work with other Kibana users. You can switch
            your tenant anytime by clicking the user avatar on top right.
          </EuiText>

          <EuiSpacer />

          {content}
        </EuiModalBody>
        <EuiModalFooter>
          <EuiButtonEmpty onClick={props.handleClose}>Cancel</EuiButtonEmpty>

          <EuiButton fill disabled={!isMultiTenancyEnabled} onClick={handleTenantConfirmation}>
            Confirm
          </EuiButton>
        </EuiModalFooter>
      </EuiModal>
    </EuiOverlayMask>
  );
}