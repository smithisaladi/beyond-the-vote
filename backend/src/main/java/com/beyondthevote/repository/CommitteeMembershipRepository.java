package com.beyondthevote.repository;

import com.beyondthevote.entity.CommitteeMembership;
import com.beyondthevote.entity.CommitteeMembershipId;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface CommitteeMembershipRepository extends JpaRepository<CommitteeMembership, CommitteeMembershipId> {

    List<CommitteeMembership> findByIdBioguideId(String bioguideId);
}
