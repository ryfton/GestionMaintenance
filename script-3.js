      const { error: rpcError } = await sb().rpc('consume_articles_for_intervention', {
        p_intervention_id: parseInt(currentInterventionId), // Force conversion en bigint
        p_items: itemsToConsume,
        p_user: currentUser?.email || 'Utilisateur'
      }, {
        head: false
      });