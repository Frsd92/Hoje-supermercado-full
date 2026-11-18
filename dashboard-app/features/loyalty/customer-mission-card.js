import { ArrowRight, Gift, Target } from 'lucide-react';
import { describeMission, formatDate, missionProgress, missionRuleLabels } from './customer-mission-display';
import { getLoyaltyMissionDestinationHref } from './mission-destinations';

export default function CustomerMissionCard({ mission, compact = false }) {
  const progress = missionProgress(mission);
  const complete = Boolean(mission.completedAt);
  const cooldownActive = Boolean(mission.cooldownActive);
  const cooldownDaysLabel = mission.cooldownDaysRemaining === 1 ? 'dia' : 'dias';
  const rewardUnavailable = mission.soldOut && !complete;
  const progressPercent = complete ? 100 : Math.max(0, Math.min(100, progress.percent));
  const currentProgress = complete ? progress.target : progress.current;
  const hasAction = !compact && !complete && !mission.soldOut;
  const destinationHref = getLoyaltyMissionDestinationHref(mission.destinationPath);

  return <article className={`customer-coupon-card loyalty-mission-card${complete ? ' is-complete' : ''}`}>
    <div className={`loyalty-mission-card-layout${compact ? ' is-compact' : ''}${hasAction ? ' has-action' : ''}`}>
      <div className="loyalty-mission-thumb">
        {mission.imageUrl
          ? <img src={mission.imageUrl} alt={`Miniatura da missão ${mission.name}`} loading="lazy" />
          : <Target size={20} aria-hidden="true" />}
      </div>
      <div className="loyalty-mission-content">
        <div className="loyalty-mission-heading">
          <div className="loyalty-mission-info">
            <small className="loyalty-mission-kind">{missionRuleLabels[mission.ruleType] || 'Missão'}</small>
            <h3>{mission.name}</h3>
          </div>
          <span className={`customer-coupon-status${cooldownActive ? ' status-cooldown' : complete ? '' : mission.soldOut ? ' status-expired' : ''}`}>
            {cooldownActive
              ? `Volta em ${mission.cooldownDaysRemaining} ${cooldownDaysLabel}`
              : complete ? 'Concluída' : mission.soldOut ? 'Limite atingido' : mission.recurrence === 'weekly' ? 'Missão semanal' : 'Em andamento'}
          </span>
        </div>
        <p className="customer-coupon-card-message">{mission.description || describeMission(mission)}</p>
        <div className={`loyalty-mission-reward${complete ? ' is-complete' : rewardUnavailable ? ' is-unavailable' : ''}`}>
          <Gift size={17} aria-hidden="true" />
          <span>
            <small>{complete ? 'Recompensa recebida' : rewardUnavailable ? 'Recompensas esgotadas' : 'Recompensa ao concluir'}</small>
            <strong>{rewardUnavailable ? 'Indisponível' : `+${mission.pointsReward.toLocaleString('pt-BR')} pontos`}</strong>
          </span>
        </div>
        <div className="loyalty-mission-progress">
          <div className="loyalty-progress-label">
            <span>Progresso</span>
            <strong>{currentProgress} / {progress.target} · {Math.round(progressPercent)}%</strong>
          </div>
          <div
            className="loyalty-progress-track"
            role="progressbar"
            aria-label={`Progresso da missão ${mission.name}`}
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow={Math.round(progressPercent)}
            aria-valuetext={`${currentProgress} de ${progress.target}; ${Math.round(progressPercent)}% concluído`}
          >
            <span style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
        {!compact && <>
          <p className="loyalty-mission-footer">
            {cooldownActive
              ? `Você poderá fazer esta missão novamente em ${formatDate(mission.availableAgainAt)}.`
              : complete
              ? `Concluída em ${formatDate(mission.completedAt)}.`
              : rewardUnavailable
                ? 'As recompensas desta missão foram esgotadas.'
                : mission.recurrence === 'weekly'
                  ? 'Conclua pedidos elegíveis para avançar. O progresso reinicia a cada semana.'
                  : 'Conclua pedidos elegíveis para avançar até a meta.'}
          </p>
          {mission.remainingRewards !== null && !mission.soldOut && <small className="loyalty-expiry-note loyalty-rewards-remaining-note">
            Restam {mission.remainingRewards.toLocaleString('pt-BR')} recompensa(s) nesta missão.
          </small>}
          {mission.pointsExpiryPolicy !== 'NEVER' && <small className="loyalty-expiry-note loyalty-points-expiry-note">
            {mission.pointsExpiryPolicy === 'CYCLE_END'
              ? mission.recurrence === 'after_days' && !complete
                ? `Após concluir, os pontos duram até a próxima rodada, em ${mission.recurrenceDays} dias.`
                : `Os pontos expiram em ${formatDate(mission.cycleEndAt)}.`
              : 'Os pontos seguem o prazo de validade configurado nesta missão.'}
          </small>}
        </>}
      </div>
      {hasAction && <a className="loyalty-mission-action" href={destinationHref} aria-label={`Aproveitar a missão ${mission.name}`}>
        Aproveitar <ArrowRight size={15} aria-hidden="true" />
      </a>}
    </div>
  </article>;
}
